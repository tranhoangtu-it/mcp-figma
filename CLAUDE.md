# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server bridging AI clients to Figma Desktop via Plugin API + WebSocket. Three components:

1. **MCP Server** (`src/mcp-server/`) — Exposes 25 design tools via stdio, connects to WS relay
2. **WebSocket Server** (`src/websocket/`) — Relay with token auth, channel routing, heartbeat
3. **Figma Plugin** (`src/figma-plugin/`) — Runs inside Figma Desktop, executes Plugin API calls

## Build & Run

```bash
npm run build          # Build with tsup
npm run ws             # Start WebSocket relay server (shows session token)
npm run start          # Start MCP server (needs MCP_FIGMA_TOKEN env)
npm run dev            # Watch mode
npm run test           # Run all tests
npm run test:ws        # Run WebSocket tests only
```

## Architecture

```
AI Client → MCP (stdio) → MCP Server → WebSocket (127.0.0.1:3055, token auth) → Figma Plugin → Figma Canvas
```

- MCP Server uses stdio transport (stdout = protocol, stderr = logging)
- WebSocket relay binds 127.0.0.1 only with per-session random token
- Figma Plugin is plain JS (code.js) running in WASM sandbox + HTML UI (ui.html) for WebSocket

## Key Conventions

- **Figma colors use 0-1 RGBA** (not 0-255) — all color params are `z.number().min(0).max(1)`
- **Plugin code.js is plain JavaScript** — Figma sandbox doesn't support TypeScript, modules, or most browser APIs
- **All logging to stderr** — stdout is reserved for MCP stdio transport
- **Message IDs use `crypto.randomUUID()`** — for request/response correlation over async WebSocket
- Tools are organized in modular files under `src/mcp-server/tools/` by function category
- Shared schemas and constants live in `src/shared/`

## Testing

Tests use Node.js built-in test runner with tsx loader:
```bash
node --import tsx --test src/websocket/ws-server.test.ts
```

Figma Plugin cannot be unit tested outside Figma — integration testing requires Figma Desktop with plugin imported from manifest.

## Security Notes

- Never pass design data to `child_process.exec()` (CVE-2025-53967 pattern)
- WebSocket token rotates every server restart
- All results from Figma are sanitized via `sanitizeResult()` before reaching AI
- Plugin code is publicly readable in Figma — never store secrets
