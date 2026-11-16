/**
 * dsh-opencode-go-session — Client half.
 *
 * Adds one sidebar entry and its central panel: whether the header is going out,
 * which endpoints receive it, and the value each recent conversation sent. The
 * values come from the Host API registered by `index.js`; this half only renders.
 */
window.__ModuleLoader__.load({
  id: 'dsh-opencode-go-session',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;

    const NS = 'opencode-go-session';
    const API = '/plugins/opencode-go-session/api';
    const PANEL_KEY = 'opencode-go-session';
    const PANEL_ORDER = 44;
    const REFRESH_MS = 3000;

    // Assigned by `apply` so a slot that supplies no `t` still gets real text.
    let boundT = (key) => key;

    const DICT = {
      en: {
        'title': 'OpenCode session header',
        'subtitle': 'One stable x-opencode-session value per conversation, taken from the DSH session of each request.',
        'state.active': 'Sending',
        'state.idle': 'Waiting for the first request',
        'state.broken': 'Last call failed',
        'row.header': 'Header',
        'row.scope': 'Applies to',
        'scope.opencode': 'OpenCode endpoints',
        'scope.all': 'All pi-ai providers',
        'row.fallback': 'No-session value',
        'fallback.none': 'Header omitted',
        'row.requests': 'Calls seen',
        'row.injected': 'Headers sent',
        'row.last': 'Last sent',
        'row.error': 'Last error',
        'last.none': 'Never',
        'conversations.title': 'Conversations',
        'conversations.empty': 'No conversation has called an OpenCode endpoint since this plugin loaded.',
        'conversations.meta': '{{provider}} / {{model}} · {{count}} calls · {{age}}',
        'age.justNow': 'just now',
        'age.seconds': '{{count}} s ago',
        'age.minutes': '{{count}} min ago',
        'age.hours': '{{count}} h ago',
        'notice.failed': 'Could not read the status: {{message}}',
        'notice.loading': 'Reading…',
        'hint.config': 'Change the header, its scope, or the no-session value in this plugin\'s config in cordis.patch.yml; saving that config restarts the plugin.',
      },
      zh: {
        'title': 'OpenCode 会话头',
        'subtitle': '每个会话一个稳定的 x-opencode-session 值，取自该次请求的 DSH 会话 id。',
        'state.active': '正在发送',
        'state.idle': '等待第一次请求',
        'state.broken': '最近一次调用失败',
        'row.header': '请求头',
        'row.scope': '生效范围',
        'scope.opencode': 'OpenCode 端点',
        'scope.all': '全部 pi-ai 提供方',
        'row.fallback': '无会话时的值',
        'fallback.none': '不发送该头',
        'row.requests': '观察到调用',
        'row.injected': '已发送请求头',
        'row.last': '最近发送',
        'row.error': '最近错误',
        'last.none': '从未',
        'conversations.title': '会话',
        'conversations.empty': '插件加载后还没有会话调用过 OpenCode 端点。',
        'conversations.meta': '{{provider}} / {{model}} · {{count}} 次 · {{age}}',
        'age.justNow': '刚刚',
        'age.seconds': '{{count}} 秒前',
        'age.minutes': '{{count}} 分钟前',
        'age.hours': '{{count}} 小时前',
        'notice.failed': '读取状态失败：{{message}}',
        'notice.loading': '正在读取…',
        'hint.config': '修改请求头、生效范围或无会话时的值，请编辑 cordis.patch.yml 中本插件的 config；保存后插件会重启。',
      },
    };

    const CSS = `
.ocs-root {
  box-sizing: border-box;
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 32px 48px;
  color: var(--dsw-alias-label-primary);
}
.ocs-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.ocs-sub {
  margin: 0 0 24px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.ocs-card {
  margin: 0 0 16px;
  padding: 16px 18px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.ocs-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}
.ocs-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent);
}
.ocs-dot-idle { background: var(--dsw-alias-state-idle-primary); box-shadow: none; }
.ocs-dot-error { background: var(--dsw-alias-state-error-primary); box-shadow: none; }
.ocs-row {
  display: flex;
  gap: 12px;
  padding: 5px 0;
  font-size: 13px;
  align-items: baseline;
}
.ocs-key {
  flex: 0 0 112px;
  color: var(--dsw-alias-label-secondary);
}
.ocs-val {
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
}
.ocs-val-error { color: var(--dsw-alias-state-error-primary); }
.ocs-meta {
  display: block;
  margin-top: 2px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.ocs-item {
  padding: 8px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.ocs-item:first-of-type { border-top: none; }
.ocs-empty {
  margin: 0;
  padding: 4px 0 2px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.ocs-count {
  margin-left: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 400;
  color: var(--dsw-alias-label-secondary);
}
.ocs-hint {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.ocs-notice {
  margin: 16px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  font-size: 12px;
  line-height: 1.6;
}
.ocs-notice-error { color: var(--dsw-alias-state-error-primary); }
`;

    /** Call the Host API and unwrap `{ ok, value }`. */
    async function request(method) {
      const response = await fetch(`${API}/${method}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (payload === null || payload.ok !== true) {
        throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
      }
      return payload.value;
    }

    /** Translate with a `{{name}}` substitution. */
    function fill(template, values) {
      if (typeof template !== 'string') return '';
      return template.replace(/\{\{(\w+)\}\}/gu, (match, key) => (values[key] === undefined ? match : String(values[key])));
    }

    /** Compact age of an ISO timestamp, re-read on every render while the panel polls. */
    function age(iso, t) {
      const then = Date.parse(iso ?? '');
      if (Number.isNaN(then)) return t('last.none');
      const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
      if (seconds < 5) return t('age.justNow');
      if (seconds < 90) return fill(t('age.seconds'), { count: seconds });
      if (seconds < 5400) return fill(t('age.minutes'), { count: Math.round(seconds / 60) });
      return fill(t('age.hours'), { count: Math.round(seconds / 3600) });
    }

    function Row({ label, value, error }) {
      return h(
        'div',
        { className: 'ocs-row' },
        h('span', { className: 'ocs-key' }, label),
        h('span', { className: `ocs-val${error === true ? ' ocs-val-error' : ''}` }, value),
      );
    }

    function Panel(props) {
      const t = typeof props.t === 'function' ? props.t : boundT;
      const [status, setStatus] = useState(null);
      const [notice, setNotice] = useState(null);

      const refresh = useCallback(async () => {
        try {
          setStatus(await request('status'));
          setNotice(null);
        } catch (cause) {
          setNotice(fill(t('notice.failed'), { message: cause.message }));
        }
      }, [t]);

      useEffect(() => {
        let live = true;
        const tick = () => {
          if (live) void refresh();
        };
        tick();
        const timer = setInterval(tick, REFRESH_MS);
        return () => {
          live = false;
          clearInterval(timer);
        };
      }, [refresh]);

      const stats = status?.stats;
      const failed = stats !== undefined && stats.errors > 0;
      const sending = stats !== undefined && stats.injected > 0;
      const state = failed ? t('state.broken') : sending ? t('state.active') : t('state.idle');
      const dot = failed ? ' ocs-dot-error' : sending ? '' : ' ocs-dot-idle';
      const sessions = status?.sessions ?? [];

      return h(
        'div',
        { className: 'ocs-root' },
        h('style', { key: 'css' }, CSS),
        h('h1', { className: 'ocs-title' }, t('title')),
        h('p', { className: 'ocs-sub' }, t('subtitle')),
        h(
          'section',
          { className: 'ocs-card' },
          h(
            'div',
            { className: 'ocs-head' },
            h('span', { className: `ocs-dot${dot}` }),
            h('span', null, status === null ? t('notice.loading') : state),
          ),
          h(Row, { label: t('row.header'), value: status?.headerName ?? '—' }),
          h(Row, {
            label: t('row.scope'),
            value: status === null ? '—' : t(status.endpoints === 'all' ? 'scope.all' : 'scope.opencode'),
          }),
          h(Row, {
            label: t('row.fallback'),
            value: status === null
              ? '—'
              : status.fallbackValue === ''
                ? t('fallback.none')
                : status.fallbackValue,
          }),
          h(Row, { label: t('row.requests'), value: stats === undefined ? '—' : String(stats.requests) }),
          h(Row, { label: t('row.injected'), value: stats === undefined ? '—' : String(stats.injected) }),
          h(Row, { label: t('row.last'), value: stats?.lastAt === null || stats === undefined ? t('last.none') : age(stats.lastAt, t) }),
          failed ? h(Row, { label: t('row.error'), value: stats.lastError, error: true }) : null,
          h('p', { className: 'ocs-hint' }, t('hint.config')),
        ),
        h(
          'section',
          { className: 'ocs-card' },
          h(
            'div',
            { className: 'ocs-head' },
            h('span', null, t('conversations.title')),
            sessions.length === 0 ? null : h('span', { className: 'ocs-count' }, String(sessions.length)),
          ),
          sessions.length === 0
            ? h('p', { className: 'ocs-empty' }, status === null ? t('notice.loading') : t('conversations.empty'))
            : sessions.map((row) => h(
              'div',
              { className: 'ocs-item', key: row.sessionId },
              h(
                'div',
                { className: 'ocs-val' },
                row.sessionId,
                h(
                  'span',
                  { className: 'ocs-meta' },
                  fill(t('conversations.meta'), {
                    provider: row.provider,
                    model: row.model,
                    count: row.count,
                    age: age(row.lastAt, t),
                  }),
                ),
              ),
            )),
        ),
        notice === null ? null : h('div', { className: 'ocs-notice ocs-notice-error' }, notice),
      );
    }

    function SidebarIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 20;
      return h(
        'svg',
        { viewBox: '0 0 48 48', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h(
          'defs',
          null,
          h(
            'linearGradient',
            { id: 'ocs-tile-sidebar', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0', stopColor: '#5f7fe8' }),
            h('stop', { offset: '1', stopColor: '#2c3f9e' }),
          ),
        ),
        h('rect', { x: '0', y: '0', width: '48', height: '48', rx: '9.6', fill: 'url(#ocs-tile-sidebar)' }),
        h('circle', {
          cx: '17.4',
          cy: '24',
          r: '4.9',
          fill: 'none',
          stroke: '#ffffff',
          strokeWidth: '3.4',
        }),
        h('path', {
          d: 'M22.3 24 H35.2 M31.2 24 V29.4 M35.2 24 V28.2',
          fill: 'none',
          stroke: '#ffffff',
          strokeWidth: '3.4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        for (const [locale, dict] of Object.entries(DICT)) {
          ctx.effect(() => ctx.locale.register(NS, locale, dict), `dsh-opencode-go-session: ${locale} texts`);
        }
        boundT = ctx.locale.bind(NS);

        ctx.effect(
          () => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist',
            id: PANEL_KEY,
            order: PANEL_ORDER,
            label: () => boundT('title'),
            locale: NS,
          }, SidebarIcon)),
          'dsh-opencode-go-session: sidebar entry',
        );
        ctx.effect(
          () => ctx.slots.inject('main', () => ctx.slots.register({
            name: 'main',
            key: PANEL_KEY,
            locale: NS,
          }, Panel)),
          'dsh-opencode-go-session: main panel',
        );
      },
    };
  },
});
