---
name: mcp-figma-plugin-bridge
status: completed
created: 2026-03-29
completed: 2026-03-29
blockedBy: []
blocks: []
---

# mcp-figma — Figma Plugin + MCP Bridge

## Overview

MCP server bridging AI clients (Claude, GPT, Cursor) to Figma Desktop via Plugin API + WebSocket. Zero rate limits, free, real-time design manipulation.

**Architecture:** `AI Client → MCP (stdio) → MCP Server → WebSocket (127.0.0.1, token auth) → Figma Plugin → Figma Canvas`

## Context

- [Brainstorm Report](../reports/brainstorm-260329-1104-mcp-figma-universal-design-bridge.md)
- [Landscape Research](../reports/researcher-260329-1052-mcp-figma-landscape.md)
- [Plugin Risks Analysis](../reports/researcher-260329-1104-figma-plugin-risks-analysis.md)
- [TalkToFigma Deep Dive](../reports/researcher-260329-1104-talktofigma-deep-dive.md)

## Key Decisions

- **Plugin API over REST API**: No rate limits, no paid tier required
- **WebSocket bridge**: Required because Figma plugin sandbox blocks direct external calls
- **Token auth**: Per-session random token, unlike Grab's unauthenticated approach
- **Node.js + TypeScript**: MCP SDK ecosystem standard
- **Desktop only**: Web app has inconsistent plugin behavior

## Phases

| # | Phase | Status | Priority | Effort |
|---|-------|--------|----------|--------|
| 1 | [Project Setup & Scaffolding](./phase-01-project-setup.md) | completed | P0 | S |
| 2 | [WebSocket Server with Auth](./phase-02-websocket-server.md) | completed | P0 | M |
| 3 | [Figma Plugin](./phase-03-figma-plugin.md) | completed | P0 | L |
| 4 | [MCP Server & Tools](./phase-04-mcp-server-tools.md) | completed | P0 | L |
| 5 | [Integration & Testing](./phase-05-integration-testing.md) | completed | P0 | M |
| 6 | [Security & Polish](./phase-06-security-polish.md) | completed | P1 | M |

## Success Criteria

- AI creates a login page in Figma from text description
- AI reads existing design and describes it accurately
- Round-trip latency < 500ms for simple operations
- WebSocket authenticated, no unauthenticated access possible
