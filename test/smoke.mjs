/**
 * Smoke test for the Host half: the header a call receives, the counters the
 * panel reads, and the status API. Run with `node test/smoke.mjs`; no deps.
 */
import assert from 'node:assert/strict';
import { apply, name } from '../index.js';

/** Minimal cordis context: capture the waterfall listener and the route. */
function fakeContext() {
  const listeners = new Map();
  const routes = [];
  const ctx = {
    on(event, listener) {
      listeners.set(event, listener);
      return () => listeners.delete(event);
    },
    inject(services, callback) {
      assert.deepEqual(services, ['webServer']);
      const scope = {
        webServer: {
          register(route) {
            routes.push(route);
            return () => {};
          },
        },
        effect(register) {
          register();
          return () => {};
        },
      };
      callback(scope);
      return { dispose() {} };
    },
  };
  return {
    ctx,
    routes,
    /** Dispatch one header preparation through the registered listener. */
    prepare(request, headers = new Headers()) {
      const listener = listeners.get('llm-pi-ai/request-headers');
      assert.ok(listener, 'the plugin registered a request-headers listener');
      return listener(request, headers, () => headers);
    },
  };
}

/** One request as the waterfall receives it. */
function call(baseURL, sessionId, purpose) {
  return {
    provider: 'opencode-deepseek-v4-1-flash',
    model: 'deepseek-v4.1-flash',
    baseURL,
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(purpose === undefined ? {} : { purpose }),
  };
}

/** Read `GET /status` from the mounted route. */
async function readStatus(route) {
  const response = await new Promise((resolve, reject) => {
    const payload = { status: 0, body: null };
    const res = {
      writeHead(status) { payload.status = status; },
      end(body) { payload.body = JSON.parse(body); resolve(payload); },
    };
    try {
      route.handler({ method: 'GET', url: '/plugins/opencode-go-session/api/status' }, res);
    } catch (error) {
      reject(error);
    }
  });
  assert.equal(response.status, 200);
  return response.body.value;
}

const OPENCODE = 'https://opencode.ai/zen/go/v1';
const OTHER = 'https://api.example.com/v1';

const cases = [];
const test = (label, run) => cases.push({ label, run });

test('the conversation id becomes the header', () => {
  const { ctx, prepare } = fakeContext();
  apply(ctx, {});
  const headers = prepare(call(OPENCODE, '10816754-daf6-4e6a-9ce2-e284db223999'));
  assert.equal(headers.get('x-opencode-session'), '10816754-daf6-4e6a-9ce2-e284db223999');
});

test('two conversations never share a value', () => {
  const { ctx, prepare } = fakeContext();
  apply(ctx, {});
  const first = prepare(call(OPENCODE, 'session-a'));
  const second = prepare(call(OPENCODE, 'session-b'));
  const again = prepare(call(OPENCODE, 'session-a'));
  assert.equal(first.get('x-opencode-session'), 'session-a');
  assert.equal(second.get('x-opencode-session'), 'session-b');
  assert.equal(again.get('x-opencode-session'), 'session-a');
});

test('another host is left alone by default', () => {
  const { ctx, prepare } = fakeContext();
  apply(ctx, {});
  assert.equal(prepare(call(OTHER, 'session-a')).get('x-opencode-session'), null);
});

test('endpoints=all reaches every pi-ai provider', () => {
  const { ctx, prepare } = fakeContext();
  apply(ctx, { endpoints: 'all' });
  assert.equal(prepare(call(OTHER, 'session-a')).get('x-opencode-session'), 'session-a');
});

test('a call without a session id uses the fallback, or sends nothing', () => {
  const withFallback = fakeContext();
  apply(withFallback.ctx, { fallbackValue: 'shared' });
  assert.equal(withFallback.prepare(call(OPENCODE, undefined)).get('x-opencode-session'), 'shared');

  const bare = fakeContext();
  apply(bare.ctx, {});
  assert.equal(bare.prepare(call(OPENCODE, undefined)).get('x-opencode-session'), null);
});

test('a static profile header is replaced', () => {
  const { ctx, prepare } = fakeContext();
  apply(ctx, {});
  const headers = new Headers([['x-opencode-session', 'stale-hardcoded-value']]);
  assert.equal(prepare(call(OPENCODE, 'live-id'), headers).get('x-opencode-session'), 'live-id');
});

test('a custom header name is honoured', () => {
  const { ctx, prepare } = fakeContext();
  apply(ctx, { headerName: 'X-OpenCode-Session' });
  assert.equal(prepare(call(OPENCODE, 'session-a')).get('X-OpenCode-Session'), 'session-a');
});

test('an unusable header name fails activation instead of every call', () => {
  const { ctx } = fakeContext();
  assert.throws(() => apply(ctx, { headerName: 'not a header' }), /not a valid HTTP header name/u);
});

test('a broken header is counted and shown, never thrown into the call', async () => {
  const { ctx, prepare, routes } = fakeContext();
  apply(ctx, {});
  const hostile = { set() { throw new TypeError('immutable'); } };
  assert.ok(prepare(call(OPENCODE, 'session-a'), hostile), 'the waterfall still returns headers');

  const route = routes.find((entry) => entry.path.endsWith('/api'));
  const value = await readStatus(route);
  assert.equal(value.stats.errors, 1);
  assert.match(value.stats.lastError, /immutable/u);
  assert.equal(value.stats.injected, 0);
});

test('the status api reports what was sent', async () => {
  const { ctx, prepare, routes } = fakeContext();
  apply(ctx, {});
  prepare(call(OPENCODE, 'session-a'));
  prepare(call(OPENCODE, 'session-a'));
  prepare(call(OPENCODE, 'session-b', 'title'));
  prepare(call(OTHER, 'session-c'));
  prepare(call(OPENCODE, undefined));

  const route = routes.find((entry) => entry.path.endsWith('/api'));
  assert.equal(route.kind, 'prefix');
  const value = await readStatus(route);

  assert.equal(value.headerName, 'x-opencode-session');
  assert.equal(value.endpoints, 'opencode');
  assert.equal(value.stats.requests, 5);
  assert.equal(value.stats.injected, 3);
  assert.equal(value.stats.errors, 0);
  assert.deepEqual(value.sessions.map((row) => row.sessionId), ['session-b', 'session-a']);
  assert.deepEqual(value.sessions.map((row) => row.count), [1, 2]);
  assert.equal(name, 'opencode-go-session');
});

test('an unknown api path is 404', async () => {
  const { ctx, routes } = fakeContext();
  apply(ctx, {});
  const route = routes.find((entry) => entry.path.endsWith('/api'));
  const status = await new Promise((resolve) => {
    route.handler({ method: 'GET', url: '/plugins/opencode-go-session/api/other' }, {
      writeHead(value) { resolve(value); },
      end() {},
    });
  });
  assert.equal(status, 404);
});

let failures = 0;
for (const entry of cases) {
  try {
    await entry.run();
    process.stdout.write(`ok   ${entry.label}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`FAIL ${entry.label}\n     ${error.message}\n`);
  }
}
process.stdout.write(`\n${cases.length - failures}/${cases.length} passed\n`);
process.exitCode = failures === 0 ? 0 : 1;
