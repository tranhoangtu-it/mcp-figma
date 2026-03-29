# Phase 5: Integration & Testing

## Overview
- **Priority:** P0
- **Status:** completed
- **Effort:** Medium
- **Description:** End-to-end integration testing of MCP Server ↔ WebSocket ↔ Figma Plugin pipeline. Verify all tools work with real Figma Desktop.

## Key Insights
- Cannot unit test Figma Plugin API outside Figma — integration tests are primary validation
- MCP Inspector (`@modelcontextprotocol/inspector`) can test MCP server tools
- WS server + auth can be unit tested independently
- Real Figma Desktop required for plugin testing

## Implementation Steps

### 5.1 Unit Tests (no Figma required)

**WebSocket Server tests:**
- Server starts and accepts connections on 127.0.0.1
- Auth rejection: wrong token → connection closed
- Auth acceptance: correct token → connection maintained
- Channel routing: messages reach correct channel members
- No-echo: sender doesn't receive own message
- Heartbeat: dead connections cleaned up
- Rate limit: excessive messages throttled

**Message Schema tests:**
- Valid messages pass Zod validation
- Invalid messages rejected with descriptive errors
- Edge cases: missing fields, wrong types, out-of-range values

**MCP Server tests (mock WS):**
- All tools register without errors
- Tool params validated by Zod schemas
- Timeout triggers after 30s with no response
- Progress update resets timeout
- UUID correlation matches request to response

### 5.2 Integration Tests (requires Figma Desktop)

**Setup script:**
1. Start WS server → capture token
2. Start MCP server → connect to WS
3. User opens Figma Desktop → imports plugin from manifest → enters token
4. Run test suite via MCP Inspector or test script

**Test scenarios:**

| Test | Steps | Expected |
|---|---|---|
| Connection flow | Start all 3 components, verify connected | Plugin shows green status |
| Read document | `get_document_info` | Returns document name + pages |
| Create frame | `create_frame(100,100,400,300,"TestFrame")` | Frame appears in Figma canvas |
| Create text | `create_text("Hello",150,150)` | Text node with "Hello" appears |
| Read back | `get_node_info(createdNodeId)` | Returns correct properties |
| Modify node | `set_fill_color(nodeId,1,0,0)` | Node turns red |
| Delete node | `delete_node(nodeId)` | Node removed from canvas |
| Export | `export_node(nodeId,"PNG")` | Returns base64 PNG data |
| Error handling | `get_node_info("nonexistent")` | Returns error, no crash |
| Disconnect recovery | Kill WS server → restart | Plugin reconnects, MCP resumes |

### 5.3 Developer Setup Documentation

Create README.md with:
1. Prerequisites: Node.js 18+, Figma Desktop
2. Install: `npm install`
3. Build: `npm run build`
4. Start WS server: `npm run ws` (displays token)
5. Start MCP server: `npm run start` (or configure in Claude/Cursor)
6. Import plugin in Figma: Plugins → Development → Import from manifest
7. Enter token in plugin UI → Connect
8. MCP config JSON for Claude Code / Cursor

### 5.4 npm scripts

```json
{
  "build": "tsup",
  "ws": "node dist/ws-server.js",
  "start": "node dist/server.js",
  "dev": "tsup --watch",
  "test": "node --test src/**/*.test.ts",
  "test:ws": "node --test src/websocket/**/*.test.ts"
}
```

## Todo List
- [x] Write WS server unit tests (auth, routing, heartbeat)
- [x] Write message schema validation tests
- [x] Write MCP tool registration tests (mock WS)
- [x] Write integration test script for full pipeline
- [x] Create README.md with setup instructions
- [x] Create MCP config examples for Claude Code + Cursor
- [x] Manual smoke test: create login page via AI in Figma
- [x] Verify error scenarios don't crash any component

## Success Criteria
- All unit tests pass
- Full pipeline works: AI → MCP → WS → Plugin → Figma canvas
- README enables new user to set up in < 10 minutes
- Error scenarios handled gracefully (no crashes, clear messages)
- AI can create a simple login page from text description (smoke test)

## Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Figma Desktop version differences | Low | Document minimum version, test on latest |
| Plugin import fails silently | Medium | Clear error messages in plugin UI |
| MCP Inspector compatibility | Low | Fallback to manual testing via Claude Code |
