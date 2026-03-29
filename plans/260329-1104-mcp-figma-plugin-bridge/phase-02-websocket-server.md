# Phase 2: WebSocket Server with Auth

## Overview
- **Priority:** P0
- **Status:** completed
- **Effort:** Medium
- **Description:** WebSocket relay server with per-session token authentication, channel-based routing, and security hardening.

## Key Insights
- Grab's WS server has **no auth** → CVE risk. We add token auth from day 1.
- Bind `127.0.0.1` only (not `0.0.0.0`) to prevent WSL cross-VM access
- Channel-based routing allows multiple AI clients (future v2)
- No-echo broadcast pattern: sender doesn't receive own messages

## Context Links
- [Plugin Risks Analysis](../reports/researcher-260329-1104-figma-plugin-risks-analysis.md) — WebSocket security section
- [TalkToFigma Deep Dive](../reports/researcher-260329-1104-talktofigma-deep-dive.md) — WS implementation details

## Architecture

```
┌──────────────┐         ┌────────────────────────┐        ┌──────────────┐
│  MCP Server  │──WS──→  │   WebSocket Server     │←──WS── │ Figma Plugin │
│  (WS Client) │         │  ┌──────────────────┐  │        │  (WS Client) │
└──────────────┘         │  │ Token Validator   │  │        └──────────────┘
                          │  │ Channel Router    │  │
                          │  │ Message Sanitizer │  │
                          │  └──────────────────┘  │
                          │  127.0.0.1:3055        │
                          └────────────────────────┘
```

## Related Code Files
- Create: `src/websocket/ws-server.ts`, `src/websocket/ws-auth.ts`
- Create: `src/shared/message-schema.ts`, `src/shared/constants.ts`

## Implementation Steps

### 2.1 Message Schema (`src/shared/message-schema.ts`)

Define Zod schemas for all WebSocket messages:

```typescript
// Message types
type: "join" | "message" | "auth" | "progress" | "error" | "system"

// Auth message (new — not in Grab's impl)
{ type: "auth", token: string, channel: string }

// Command message
{ type: "message", channel: string, message: { command: string, params: Record<string,any>, id: string } }

// Response message
{ type: "message", channel: string, message: { result: any, id: string, error?: string } }
```

### 2.2 Token Auth (`src/websocket/ws-auth.ts`)

- On server start: generate random 32-char hex token
- Display token in console + write to temp file (for MCP server to read)
- First message from client MUST be `{type: "auth", token: "..."}`
- Reject + close connection on wrong token
- Token rotates every server restart

### 2.3 WebSocket Server (`src/websocket/ws-server.ts`)

- Host: `127.0.0.1`, Port: `3055` (configurable via env `MCP_FIGMA_PORT`)
- Use `ws` library (not Bun native — for Node.js compatibility)
- Channel routing: `Map<string, Set<WebSocket>>`
- No-echo broadcast: skip sender when broadcasting
- Connection cleanup on disconnect
- Heartbeat ping/pong every 30s to detect dead connections
- Max message size: 10MB (for image export data)

### 2.4 Security Measures

- Validate all incoming messages against Zod schemas before processing
- Reject malformed messages with error response
- Log all connections/disconnections (stderr, not stdout — MCP uses stdout)
- Rate limit: max 100 messages/second per client (prevent flooding)

## Todo List
- [x] Define message Zod schemas in shared module
- [x] Implement token generation + validation
- [x] Implement WebSocket server with channel routing
- [x] Add heartbeat ping/pong
- [x] Add message validation layer
- [x] Add rate limiting
- [x] Unit test: auth acceptance/rejection
- [x] Unit test: channel routing + no-echo
- [x] Verify server starts and accepts connections

## Success Criteria
- Server starts on 127.0.0.1:3055
- Unauthenticated connections rejected immediately
- Authenticated clients can join channels and exchange messages
- Malformed messages rejected with error
- Heartbeat detects dead connections within 60s

## Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Token stored in temp file readable by other processes | Medium | Restrict file permissions (0600), delete on shutdown |
| WebSocket library vulnerabilities | Low | Pin `ws` version, monitor advisories |
| Message flooding | Medium | Rate limiting per client |

## Security Considerations
- Token auth is defense-in-depth — localhost binding is primary defense
- All logging to stderr (stdout reserved for MCP stdio transport)
- No secrets in code — token generated at runtime only
