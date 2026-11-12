# Security review — MORS AEGIS

Review date: 2026-11-05. Scope: local Node.js server, browser client, bundled research subset, and configured upstream connectors.

## Controls implemented

- Binds to `127.0.0.1` by default. Host allow-list and same-origin checks reject cross-site browser requests and unexpected Host values.
- API credentials are read server-side only from environment variables or the user-selected credentials text file. API responses and logs contain credential-presence booleans or generic error messages, never key values. The browser does not receive provider keys.
- Content Security Policy disallows third-party scripts, fonts, frames, plugins, and non-self connections. Other response headers limit framing, MIME sniffing, referrer data, and browser permissions.
- Request bodies, upstream response bodies, connector timeouts, local request rates, cache bytes, FIRMS region size, and FIRMS date range are bounded.
- Uploaded CSV is parsed locally; field counts, types, ranges, required values, and calendar dates are checked. Invalid data cannot be marked as analyzed or produce statistics in the workflow.
- Chat history is bounded and rendered with text nodes. The user question and history are treated as untrusted instructions in the model prompt. Gemini requests use `store: false`; only the app's bundled five-row FLEX evidence and the conversation are sent on a chat request.
- Error messages avoid returning stack traces or provider response bodies. The app uses no third-party browser assets.

## Residual risks and operating boundaries

- This is a single-user local application, not an internet-facing service. It has no user authentication, account isolation, or server-side authorization. Keep it bound to localhost; do not expose the port through a reverse proxy, LAN, or public deployment without adding authentication and a deployment security review.
- Provider keys are read from the project's `.env`, or from a plaintext file only when `MORS_CREDENTIALS_FILE` explicitly points to it. Protect either with OS account controls and never place them in source control, the ZIP, screenshots, or logs. Because credentials were shared as attachments during setup, rotate/revoke provider keys if those attachment contents were real active keys.
- When Gemini is configured, chat questions and up to eight recent turns are sent to Google's Gemini API together with the bundled public research table. Do not enter secrets, personal information, or restricted research content. If the provider is down or rejects a request, the UI uses a deterministic local summary.
- Chat history is stored in browser `localStorage` on the current machine until the user clears it or browser storage is removed. Avoid shared browser profiles.
- Localhost restrictions reduce web-origin risks but do not protect against malware, a compromised local account, browser extensions, or a malicious process running as the same user.
- NOAA, NASA FIRMS, and NASA DONKI depend on their upstream services and credentials/quotas. Live-data failure is reported as unavailable; it is not a security control or a scientific substitute.

## Verification performed

Run `npm test` for the parser, schema/range/date validation, scientific summary, and workflow tests. Run `node --check server.mjs` and `node --check public/app.js` for syntax validation. HTTP boundary checks include same-origin enforcement, oversized FIRMS area rejection, malformed JSON rejection, bounded upload sizes, and static path containment. External provider availability is not guaranteed by these checks.
