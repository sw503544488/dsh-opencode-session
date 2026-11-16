/**
 * dsh-opencode-session — Host half.
 *
 * The OpenCode gateway wants one stable session id per conversation in
 * `x-opencode-session` so it can route that conversation consistently and reuse
 * its prompt cache. This plugin derives the value from the DSH session of each
 * inference call through the `llm-pi-ai/request-headers` waterfall, and serves
 * what it sent to the sidebar panel under `/plugins/opencode-session/api`.
 *
 * A static value may stay in the provider's `headers`; a header set here wins,
 * because the waterfall runs after the profile headers are copied into the
 * request.
 */
import { createRequire } from 'node:module';

/** Stable cordis plugin name. */
export const name = 'opencode-session';

const require = createRequire(import.meta.url);
const { version } = require('./package.json');

const API_BASE = '/plugins/opencode-session/api';
const DEFAULT_HEADER = 'x-opencode-session';
/** Conversations the panel keeps before dropping the least recently used one. */
const MAX_SESSIONS = 30;
/** RFC 9110 field-name token. */
const FIELD_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

/**
 * Read the row's config, filling in the defaults.
 * @param config - the `config` object of the loader row, possibly empty.
 * @returns the effective options.
 * @throws Error when `headerName` is not a usable HTTP field name.
 */
function normalizeOptions(config) {
  const raw = config !== null && typeof config === 'object' ? config : {};
  const configured = typeof raw.headerName === 'string' ? raw.headerName.trim() : '';
  const headerName = configured === '' ? DEFAULT_HEADER : configured.toLowerCase();
  if (!FIELD_NAME.test(headerName)) {
    throw new Error(`headerName ${JSON.stringify(configured)} is not a valid HTTP header name`);
  }
  return {
    headerName,
    endpoints: raw.endpoints === 'all' ? 'all' : 'opencode',
    fallbackValue: typeof raw.fallbackValue === 'string' ? raw.fallbackValue.trim() : '',
  };
}

/**
 * Whether one call's endpoint receives the header.
 * @param endpoints - the `endpoints` option.
 * @param baseURL - the resolved endpoint of the model selected for the call.
 * @returns true when this call is in scope.
 */
function coversEndpoint(endpoints, baseURL) {
  if (endpoints === 'all') return true;
  try {
    const host = new URL(baseURL).hostname.toLowerCase();
    return host === 'opencode.ai' || host.endsWith('.opencode.ai');
  } catch {
    return false;
  }
}

/** Counters and the recent-conversation table the panel renders. */
function createReport() {
  const sessions = new Map();
  const stats = { requests: 0, injected: 0, errors: 0, lastAt: null, lastError: null };
  return {
    stats,
    /** Add one injected call to its conversation's row, evicting the oldest. */
    count(sessionId, request, at) {
      let row = sessions.get(sessionId);
      if (row === undefined) {
        row = { sessionId, provider: request.provider, model: request.model, count: 0, firstAt: at, lastAt: at };
        sessions.set(sessionId, row);
        if (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value);
      }
      row.count += 1;
      row.provider = request.provider;
      row.model = request.model;
      row.lastAt = at;
    },
    /** Newest first: the top row is the conversation that spoke last. */
    snapshot(headerName, endpoints, fallbackValue) {
      const rows = [...sessions.values()].sort((left, right) => (left.lastAt < right.lastAt ? 1 : -1));
      return { version, headerName, endpoints, fallbackValue, stats: { ...stats }, sessions: rows };
    },
  };
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

export function apply(ctx, config) {
  const options = normalizeOptions(config);
  const report = createReport();

  /**
   * Set the header for one call. A failed header must never fail a conversation,
   * so the caller records a throw instead of letting it reach `REQUEST_HEADERS`.
   */
  const prepare = (request, headers) => {
    report.stats.requests += 1;
    if (!coversEndpoint(options.endpoints, request.baseURL)) return;
    const sessionId = request.sessionId === undefined ? '' : String(request.sessionId);
    const value = sessionId === '' ? options.fallbackValue : sessionId;
    if (value === '') return;
    headers.set(options.headerName, value);
    const at = new Date().toISOString();
    report.stats.injected += 1;
    report.stats.lastAt = at;
    if (sessionId !== '') report.count(sessionId, request, at);
  };

  ctx.on('llm-pi-ai/request-headers', (request, headers, next) => {
    try {
      prepare(request, headers);
    } catch (error) {
      report.stats.errors += 1;
      report.stats.lastError = error instanceof Error ? error.message : String(error);
    }
    return next();
  });

  /** `GET /status`: what the panel shows. Read-only, loopback only in practice. */
  const handler = (req, res) => {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'GET only' } });
      return;
    }
    const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
    if (pathname !== `${API_BASE}/status`) {
      writeJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method' } });
      return;
    }
    writeJson(res, 200, {
      ok: true,
      value: report.snapshot(options.headerName, options.endpoints, options.fallbackValue),
    });
  };

  // The header works without the Web carrier; only the panel needs the route.
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({ kind: 'prefix', path: API_BASE, handler }),
      'dsh-opencode-session: status api',
    );
  });
}
