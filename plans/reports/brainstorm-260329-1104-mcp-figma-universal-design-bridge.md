# Brainstorm Report: mcp-figma — Figma Plugin + MCP Bridge

**Date:** 2026-03-29 | **Status:** Approved

---

## Problem Statement

Figma charges for API access (6 calls/month on free tier). Existing MCP servers (6+ community + official) all wrap REST API → same limitations. Need a free, unlimited way for AI to read/write Figma designs.

## Solution: Figma Plugin + WebSocket + MCP Server

Instead of REST API, use **Figma Plugin API** (runs inside desktop app, no rate limits, free) bridged via WebSocket to MCP server.

### Architecture

```
AI Client → MCP (stdio) → MCP Server → WebSocket (127.0.0.1, token auth) → Figma Plugin → Figma Canvas
```

### Key Components

1. **MCP Server (Node.js/TypeScript)**: Exposes tools to AI, validates messages, manages WebSocket connection
2. **Figma Plugin**: Runs in Figma Desktop, bridges WebSocket ↔ Plugin API
3. **Message Validator**: Schema validation + sanitization layer between MCP and WebSocket

### MCP Tools

| Tool | Description |
|---|---|
| `read_design` | Read node tree, styles, components |
| `write_design` | Create/modify nodes, set properties |
| `draw_ui` | Generate UI from description |
| `export_image` | Export nodes as PNG/SVG |
| `get_tokens` | Extract design tokens |
| `edit_selection` | Modify currently selected elements |

### Capabilities (All)
- AI vẽ UI từ mô tả text
- Đọc design → sinh code
- Chỉnh sửa design elements
- Export & sync design tokens

## Evaluated Approaches

### Approach 1: Multi-Backend Adapter (Rejected)
- Abstraction too complex, YAGNI for MVP
- Penpot API maturity uncertain

### Approach 2: Penpot-First (Rejected)
- Less mature than Figma, smaller user base
- User wants Figma specifically

### Approach 3: Local-First Format (Partially adopted)
- Good idea for future but unnecessary when Plugin API gives direct access

### Approach 4: Plugin + WebSocket + MCP (Selected)
- Zero rate limits, free, real-time, direct manipulation
- Proven pattern (Grab's TalkToFigma)
- Improved with security measures

## Critical Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Unauthenticated WebSocket | CRITICAL | Per-session token auth, bind 127.0.0.1 only |
| Command injection via design data | HIGH | Sanitize all design data, schema validation |
| Plugin sandbox limitations | MEDIUM | Plugin = thin bridge, logic in MCP server |
| Free tier Variables API restriction | MEDIUM | Graceful degradation, fallback to direct style reads |
| Plugin distribution | LOW | Local dev mode for MVP, Community publish later |

## Required Features (v1.0)

- Auth token per WebSocket session
- Message schema validation + sanitization
- Connection health check + auto-reconnect
- Error recovery on plugin crash

## Planned Features (v1.1)

- Design snapshot/undo (rollback AI mistakes)
- Batch operations (reduce latency)
- Preview before apply
- Selection-aware context

## Future Features (v2)

- Component library awareness
- Design system enforcement
- Multi-page support
- Collaborative mode (multiple AI clients)

## Tech Stack
- Runtime: Node.js + TypeScript
- MCP SDK: `@modelcontextprotocol/sdk`
- Transport: stdio
- WebSocket: `ws` library
- Plugin: Figma Plugin API + iframe for network access
- Target: Figma Desktop only (MVP)

## Success Metrics
- AI can create a login page in Figma from text description
- AI can read existing design and describe it accurately
- Round-trip latency < 500ms for simple operations
- Zero security vulnerabilities in WebSocket layer

## Next Steps
→ Create detailed implementation plan with phases

## References
- [Grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp)
- [Figma Plugin API docs](https://developers.figma.com/docs/plugins/)
- [Researcher report: MCP-Figma landscape](./researcher-260329-1052-mcp-figma-landscape.md)
- [Researcher report: Plugin risks analysis](./researcher-260329-1104-figma-plugin-risks-analysis.md)
