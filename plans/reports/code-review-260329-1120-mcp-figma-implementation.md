# Code Review: mcp-figma Implementation

**Date:** 2026-03-29
**Reviewer:** code-reviewer
**Scope:** Full implementation review — 13 TS files, 1 JS plugin, 1 HTML UI, 1 manifest
**LOC:** ~900 (TypeScript) + ~490 (Plugin JS/HTML)

---

## Overall Assessment

Solid first implementation. Architecture is clean: clear separation between WS relay, MCP server, and Figma plugin. Zod schemas at boundaries, localhost-only binding, token auth, rate limiting, and input sanitization all present. Several issues found ranging from security concerns to production reliability bugs.

---

## Critical Issues

### C1. Timing-Based Token Comparison — Timing Side Channel

**File:** `src/websocket/ws-auth.ts:23`

```ts
if (token === this.token) {
```

Direct string equality on auth tokens is vulnerable to timing attacks. An attacker on localhost could statistically determine the token character by character via response timing.

**Fix:** Use `crypto.timingSafeEqual`:
```ts
import { timingSafeEqual } from "node:crypto";

authenticate(client: object, token: string): boolean {
  const a = Buffer.from(token);
  const b = Buffer.from(this.token);
  if (a.length !== b.length) {
    // Still compare to avoid leaking length info
    timingSafeEqual(b, b);
    return false;
  }
  if (timingSafeEqual(a, b)) {
    this.authenticatedClients.add(client);
    return true;
  }
  return false;
}
```

**Severity:** Critical in theory, medium in practice (localhost-only mitigates remote exploitation, but local malware could exploit it).

### C2. Channel Authorization Bypass — Message Routing Without Channel Membership Check

**File:** `src/websocket/ws-server.ts:234-236`

A client authenticated on channel "A" can send a message with `channel: "B"` in the payload, and the server will broadcast it to channel B clients without verifying the sender is a member of channel B.

```ts
case MessageType.MESSAGE: {
  broadcastToChannel(msg.channel, JSON.stringify(msg), ws);
  break;
}
```

**Fix:** Verify sender is in the target channel:
```ts
case MessageType.MESSAGE: {
  if (s.channel !== msg.channel) {
    ws.send(JSON.stringify({ type: "error", message: "Not a member of channel: " + msg.channel }));
    break;
  }
  broadcastToChannel(msg.channel, JSON.stringify(msg), ws);
  break;
}
```

Same issue applies to `MessageType.PROGRESS` (line 240).

**Impact:** Cross-channel command injection. A rogue plugin on a different channel could send commands to another user's Figma instance.

### C3. Plugin UI postMessage Target Origin Uses Wildcard

**File:** `src/figma-plugin/ui.html:141`

```js
parent.postMessage({ pluginMessage: { ... } }, '*');
```

The `'*'` origin is standard for Figma plugin architecture (plugin runs in an iframe within Figma's sandbox), so this is expected by Figma's API. **Not a bug** — documenting for completeness.

---

## High Priority

### H1. Module-Level Mutable State in ws-server.ts — Server Isolation Bug

**File:** `src/websocket/ws-server.ts:22-24`

```ts
const channels = new Map<string, Set<WebSocket>>();
const clientStates = new Map<WebSocket, ClientState>();
```

These are module-level singletons. If `startWebSocketServer()` is called multiple times (e.g., tests), all server instances share the same `channels` and `clientStates` maps. This causes test pollution and would cause production bugs if the module were ever reused.

**Fix:** Move these maps inside `startWebSocketServer()` and pass them to helper functions, or encapsulate in a class.

### H2. No Error Handling on Tool Callbacks — Unhandled Promise Rejections

**Files:** All tool registration files (`document-tools.ts`, `creation-tools.ts`, etc.)

Every tool callback does:
```ts
async (params) => {
  const result = await client.sendCommand("...", params);
  return [{ type: "text", text: JSON.stringify(result, null, 2) }];
}
```

If `sendCommand` throws (timeout, disconnect, WS error), the exception propagates to the MCP SDK. The SDK may handle it, but the tool should return a structured error response:

```ts
async (params) => {
  try {
    const result = await client.sendCommand("...", params);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
}
```

### H3. Plugin Returns Error In-Band Instead of Throwing — Error Swallowing

**File:** `src/figma-plugin/code.js:470-476`

```js
var result = await handler(msg.params || {});
figma.ui.postMessage({
  type: "command-result",
  id: msg.id,
  result: result,
  error: result && result.error ? result.error : undefined,
});
```

When a handler returns `{ error: "Node not found" }`, this is sent as BOTH `result` AND `error` fields. The MCP client receives the error string but also a result object containing the same error — confusing for consumers.

**Fix:** When error is detected, set `result: null`:
```js
var hasError = result && result.error;
figma.ui.postMessage({
  type: "command-result",
  id: msg.id,
  result: hasError ? null : result,
  error: hasError ? result.error : undefined,
});
```

### H4. Race Condition on connect() — Multiple Concurrent Calls

**File:** `src/mcp-server/ws-client.ts:45-139`

`connect()` doesn't guard against being called while a connection is already in progress or open. Calling `connect()` twice would overwrite `this.ws`, orphaning the first WebSocket (no cleanup, no `close()`), leaking the connection and event listeners.

**Fix:** Add guard:
```ts
async connect(): Promise<void> {
  if (this.ws) throw new Error("Already connected or connecting");
  // ...
}
```

### H5. `reconnecting` Field Declared but Never Used

**File:** `src/mcp-server/ws-client.ts:30`

```ts
private reconnecting = false;
```

This is dead code. Either implement reconnection logic or remove it.

---

## Medium Priority

### M1. Rate Limit Array Grows Unboundedly Under Sustained Load

**File:** `src/websocket/ws-server.ts:27-38`

`messageTimestamps` array is filtered on every call, but under sustained 100 msg/sec load, the array will always have ~100 entries being filtered per message. While not a memory leak (it's bounded at ~100 entries), the O(n) filter on every message is suboptimal.

**Fix:** Use a sliding window counter (two buckets for current and previous second) instead of storing individual timestamps.

### M2. `isMain` Detection Is Fragile

**File:** `src/websocket/ws-server.ts:278-284`

```ts
const entryFile = process.argv[1] ?? "";
const isMain =
  entryFile.endsWith("ws-server.js") ||
  (entryFile.endsWith("ws-server.ts") && !entryFile.includes(".test."));
```

This breaks if: the dist path is different, the file is bundled, or run via a custom loader. Consider using a separate entry point file (e.g., `ws-server-cli.ts`) that imports and calls `startWebSocketServer()`.

### M3. Missing `parseInt` Validation on Port

**File:** `src/mcp-server/index.ts:18-20`

```ts
const port = parseInt(process.env.MCP_FIGMA_PORT || String(DEFAULT_WS_PORT));
```

`parseInt("abc")` returns `NaN`. No validation follows. This would cause a silent failure when connecting.

**Fix:**
```ts
const port = parseInt(process.env.MCP_FIGMA_PORT || String(DEFAULT_WS_PORT));
if (isNaN(port) || port < 1 || port > 65535) {
  console.error("[mcp-figma] Invalid port");
  process.exit(1);
}
```

Same issue in `ws-server.ts:86`.

### M4. `sanitizeResult` Does Not Handle Circular References

**File:** `src/shared/sanitize.ts:22-37`

If Figma ever returns an object with circular references (unlikely but possible from plugin bugs), `sanitizeResult` will stack overflow. Consider adding a `Set<object>` visited tracker or a depth limit.

### M5. No Max Size Check on Plugin Export Response

**File:** `src/figma-plugin/code.js:379-395`

`cmdExportNode` converts bytes to base64 with no size limit. A large export (high-res, high-scale) could produce a massive string that exceeds WebSocket's `MAX_MESSAGE_SIZE` (10MB). The base64 encoding of a 10MB image is ~13.3MB, exceeding the limit.

**Fix:** Check `bytes.length` before encoding and return error if > 7MB (to account for base64 overhead).

### M6. `uuid` Package Imported but Not Used

**File:** `package.json:28`

`"uuid": "^13.0.0"` is listed as a dependency but `randomUUID` from `node:crypto` is used instead. Dead dependency.

---

## Low Priority

### L1. Inconsistent `JSON.stringify` Formatting Across Tools

Some tools use `JSON.stringify(result, null, 2)` (pretty), others use `JSON.stringify(result)` (compact). Standardize for consistent AI client experience.

### L2. Plugin JS Uses `var` Instead of `let/const`

`src/figma-plugin/code.js` uses `var` throughout. While functional (Figma sandbox supports ES2020+), `let/const` would prevent accidental hoisting bugs.

### L3. `binary` Variable Computed but Unused

**File:** `src/figma-plugin/code.js:389-391`

```js
var binary = "";
for (var i = 0; i < bytes.length; i++) {
  binary += String.fromCharCode(bytes[i]);
}
```

This builds a binary string that is never used (the actual encoding uses `figmaBase64Encode`). Dead code, wasted computation.

### L4. Missing `tsconfig.json` Review

Not provided for review but should enforce `strict: true`, `noUncheckedIndexedAccess: true`.

---

## Positive Observations

1. **Zod schemas at boundaries** — All WebSocket messages validated before processing
2. **Localhost-only binding** — `127.0.0.1` default with runtime remote-address check
3. **Command whitelist** — Plugin only executes known commands from `COMMAND_HANDLERS`
4. **Depth-limited serialization** — Prevents huge recursive payloads from Figma tree
5. **Result sanitization** — Control character stripping and string truncation on all Figma data
6. **Clean architecture** — Clear MCP server / WS relay / Plugin separation
7. **Rate limiting** — Per-client rate limiting at WS layer
8. **Heartbeat detection** — Dead connection cleanup via ping/pong
9. **Test coverage** — Core auth and channel isolation tested
10. **Graceful shutdown** — SIGINT/SIGTERM handlers clean up connections

---

## Recommended Actions (Priority Order)

1. **[Critical]** Fix C2: Add channel membership check before broadcasting
2. **[Critical]** Fix C1: Use `timingSafeEqual` for token comparison
3. **[High]** Fix H1: Move shared state inside `startWebSocketServer`
4. **[High]** Fix H2: Wrap all tool callbacks in try/catch with `isError: true`
5. **[High]** Fix H4: Guard `connect()` against double-call
6. **[Medium]** Fix M3: Validate port parsing
7. **[Medium]** Fix M5: Add export size limit in plugin
8. **[Medium]** Fix M6: Remove unused `uuid` dependency
9. **[Low]** Fix L3: Remove dead `binary` variable in code.js
10. **[Low]** Fix H5: Remove unused `reconnecting` field

---

## Test Coverage Assessment

- **Covered:** Auth rejection, token validation, channel join, broadcast, channel isolation
- **Missing:** Rate limiting, heartbeat/dead connection, max connections, malformed JSON, channel authorization bypass (C2), reconnection, concurrent connection handling

---

## Unresolved Questions

1. Should the WS server support multiple channels per client? Current design is single-channel only — is this intentional?
2. Is the Figma plugin `manifest.json` `networkAccess.allowedDomains` correctly scoped? It allows `http://localhost:3055` but not `ws://localhost:3055` — does Figma treat these equivalently?
3. Should there be a mechanism to rotate the session token without restarting the WS server?

**Status:** DONE
**Summary:** Found 2 critical, 5 high, 6 medium, 4 low issues. Key concerns: channel authorization bypass allows cross-channel command injection, timing-unsafe token comparison. Architecture and overall security posture are solid for a v0.1.
