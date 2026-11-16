# dsh-opencode-go-session

OpenCode's Console gateway asks every client to send **one stable session id per conversation** in the `x-opencode-session` header, so the gateway can route that conversation consistently and reuse its prompt cache. A hardcoded value makes every conversation look like the same one; no value means no affinity at all.

This DeepSeek Harness plugin makes the value dynamic: every inference call over the pi-ai adapter sends the **DSH session id of the conversation that made it**. One conversation keeps one value for its whole life, a new conversation gets a new one, and each subagent speaks for its own session.

It has no interface of its own: enabling the plugin is the whole setup.

## What it does

- Listens on the `llm-pi-ai/request-headers` waterfall and sets the header on each call that carries a DSH session id.
- Covers OpenCode endpoints only by default (`*.opencode.ai`); one config field widens it to every pi-ai provider.
- Wins over a static `x-opencode-session` left in the provider's `headers`, so a profile can keep that line while this plugin overrides it per conversation.
- Never breaks a call: a header problem is counted and reported on the status endpoint instead of failing the request.

## Install

- **Plugin Market / Plugin Manager**: add the package.
- **Local directory**: Plugins → Add plugin → select this directory.

The plugin adds one row, `opencode-go-session`. No configuration is required. It is published on npm as `dsh-opencode-go-session`.

## Configuration

Change the row's `config` in `cordis.patch.yml` (the loader restarts the plugin when it changes):

| Key | Default | Meaning |
| --- | --- | --- |
| `headerName` | `x-opencode-session` | Header that carries the conversation id. |
| `endpoints` | `opencode` | `opencode` sends it only to `*.opencode.ai`; `all` sends it to every pi-ai provider route. |
| `fallbackValue` | *(empty)* | Value for calls with no DSH session id, such as a helper request from outside a conversation. Empty omits the header on those calls. |

```yaml
- id: opencode-go-session
  name: 'dsh-opencode-go-session'
  config:
    endpoints: opencode
```

## Verify

The plugin reports what it sent on a read-only endpoint of the Host:

```sh
curl http://127.0.0.1:3080/plugins/opencode-go-session/api/status
```

```json
{
  "ok": true,
  "value": {
    "version": "0.1.1",
    "headerName": "x-opencode-session",
    "endpoints": "opencode",
    "fallbackValue": "",
    "stats": { "requests": 34, "injected": 34, "errors": 0, "lastAt": "2026-11-16T13:35:17.549Z", "lastError": null },
    "sessions": [
      { "sessionId": "session-b53b6603-…", "provider": "opencode-deepseek-v4-1-flash", "model": "deepseek-v4.1-flash", "count": 34, "firstAt": "…", "lastAt": "…" }
    ]
  }
}
```

A conversation appears the first time it reaches an OpenCode endpoint after the plugin loads. `requests` counts every pi-ai call the plugin saw, `injected` the ones that received the header.

## Limitations

- Only routes served by `@deepseek-ai/dsh-llm-pi-ai` are covered, which is where OpenCode providers are configured. A provider on another adapter (for example `@deepseek-ai/dsh-llm-deepseek`) receives nothing from this plugin.
- Model discovery is outside the hook's contract, so it sends no session header.
- Values and counters live in the Host process: they reset on restart, and only the latest 30 conversations are reported.

## Compatibility

Needs a Harness release that emits `llm-pi-ai/request-headers` (verified on `0.2.2-rc.3`). On older releases the plugin loads and the status endpoint reports that nothing has been sent.

## License

MIT
