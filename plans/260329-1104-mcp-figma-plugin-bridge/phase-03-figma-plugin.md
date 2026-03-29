# Phase 3: Figma Plugin

## Overview
- **Priority:** P0
- **Status:** completed
- **Effort:** Large
- **Description:** Figma Desktop plugin that bridges WebSocket ↔ Figma Plugin API. Thin bridge — all logic stays in MCP server.

## Key Insights
- Plugin runs in WASM sandbox: no DOM, no fetch, no localStorage
- Plugin UI (`ui.html` iframe) CAN access network → WebSocket lives here
- Communication: `figma.ui.postMessage()` ↔ `figma.ui.onmessage`
- `documentAccess: "dynamic-page"` required for page switching
- Plugin code is publicly readable — never store secrets
- Figma colors use 0-1 RGBA range (NOT 0-255)
- `loadFontAsync()` required before editing text nodes

## Context Links
- [TalkToFigma Deep Dive](../reports/researcher-260329-1104-talktofigma-deep-dive.md) — Plugin structure & command patterns
- [Plugin Risks Analysis](../reports/researcher-260329-1104-figma-plugin-risks-analysis.md) — Sandbox limitations

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Figma Plugin                       │
│                                                      │
│  ┌─────────────────────┐   postMessage   ┌────────┐ │
│  │     ui.html          │ ←────────────→ │ code.ts │ │
│  │  ┌───────────────┐  │                │         │ │
│  │  │ WebSocket     │  │                │ Command │ │
│  │  │ Client        │──┼── WS to ──────│ Handler │ │
│  │  │ (127.0.0.1)   │  │  MCP Server   │         │ │
│  │  └───────────────┘  │                │ Figma   │ │
│  │  ┌───────────────┐  │                │ API     │ │
│  │  │ Auth + Status │  │                │ Calls   │ │
│  │  │ UI            │  │                │         │ │
│  │  └───────────────┘  │                └────────┘ │
│  └─────────────────────┘                            │
└─────────────────────────────────────────────────────┘
```

## Related Code Files
- Create: `src/figma-plugin/manifest.json`
- Create: `src/figma-plugin/code.ts` (compiled to code.js)
- Create: `src/figma-plugin/ui.html`

## Implementation Steps

### 3.1 manifest.json

```json
{
  "name": "MCP Figma Bridge",
  "id": "mcp-figma-bridge-local",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "permissions": [],
  "networkAccess": {
    "allowedDomains": ["http://localhost:3055"],
    "devAllowedDomains": ["http://localhost:*"]
  },
  "documentAccess": "dynamic-page"
}
```

### 3.2 ui.html — WebSocket Client + UI

Responsibilities:
1. **Connect to WS server** on localhost:3055 (configurable port)
2. **Authenticate** with token (user pastes from MCP server console output)
3. **Relay messages** between WS ↔ Plugin code
4. **Show status**: connected/disconnected/error, current channel
5. **Token input field**: user enters session token

Flow:
```
WS message received → parse JSON → validate → figma.ui.postMessage(msg) → code.ts handles
code.ts result → figma.ui.postMessage(result) → ui.html → ws.send(JSON.stringify(result))
```

Key implementation details:
- Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Show connection status with color indicator
- Display session token input + port config
- Keep UI minimal (< 300 lines target)

### 3.3 code.ts — Command Dispatcher

Pattern: receive command from UI → execute Figma API → return result

**Core commands (MVP):**

| Command | Figma API | Description |
|---|---|---|
| `get_document_info` | `figma.root` | Get document name, pages, top-level structure |
| `get_selection` | `figma.currentPage.selection` | Get currently selected nodes |
| `get_node_info` | `figma.getNodeById()` | Read node properties |
| `get_page_nodes` | `figma.currentPage.children` | List page children (with depth limit) |
| `create_frame` | `figma.createFrame()` | Create frame with position/size |
| `create_rectangle` | `figma.createRectangle()` | Create rectangle |
| `create_text` | `figma.createText()` | Create text node (requires loadFontAsync) |
| `create_ellipse` | `figma.createEllipse()` | Create ellipse |
| `move_node` | `node.x = ...; node.y = ...` | Reposition node |
| `resize_node` | `node.resize(w, h)` | Resize node |
| `set_fill_color` | `node.fills = [...]` | Set solid fill (RGBA 0-1) |
| `set_stroke` | `node.strokes = [...]` | Set stroke color + width |
| `set_text_content` | `node.characters = ...` | Update text (load font first) |
| `set_corner_radius` | `node.cornerRadius = n` | Round corners |
| `delete_node` | `node.remove()` | Delete node |
| `clone_node` | `node.clone()` | Duplicate node |
| `export_node` | `node.exportAsync()` | Export as PNG/SVG → base64 |
| `set_auto_layout` | `node.layoutMode = ...` | Configure auto-layout |
| `set_name` | `node.name = ...` | Rename node |
| `group_nodes` | `figma.group()` | Group nodes together |
| `get_styles` | `figma.getLocalPaintStyles()` | Get local styles |
| `get_variables` | `figma.variables.*` | Get design tokens (may be restricted on free) |

**Error handling pattern:**
```typescript
async function handleCommand(command: string, params: any): Promise<any> {
  try {
    switch (command) {
      case "create_frame": return await createFrame(params);
      case "get_node_info": return await getNodeInfo(params);
      // ...
      default: return { error: `Unknown command: ${command}` };
    }
  } catch (err) {
    return { error: err.message || String(err) };
  }
}
```

**Font handling for text operations:**
```typescript
async function createText(params) {
  const node = figma.createText();
  // MUST load font before setting characters
  await figma.loadFontAsync({ family: params.fontFamily || "Inter", style: params.fontStyle || "Regular" });
  node.characters = params.text;
  // ... set other properties
  return serializeNode(node);
}
```

**Node serialization** — convert Figma node to JSON-safe object:
```typescript
function serializeNode(node: SceneNode, depth = 0, maxDepth = 3): object {
  const base = {
    id: node.id, name: node.name, type: node.type,
    x: node.x, y: node.y, width: node.width, height: node.height,
  };
  if ("fills" in node) base.fills = node.fills;
  if ("children" in node && depth < maxDepth) {
    base.children = node.children.map(c => serializeNode(c, depth + 1, maxDepth));
  }
  return base;
}
```

### 3.4 Progress Tracking

For long operations (batch create, export):
```typescript
figma.ui.postMessage({
  type: "progress",
  id: requestId,
  status: "in_progress",
  percentage: 50,
  message: "Creating 5/10 nodes..."
});
```

## Todo List
- [x] Create manifest.json
- [x] Implement ui.html with WS client + auth + status UI
- [x] Implement code.ts command dispatcher
- [x] Implement node read commands (get_document_info, get_node_info, get_selection, get_page_nodes)
- [x] Implement node creation commands (frame, rectangle, text, ellipse)
- [x] Implement node modification commands (move, resize, fill, stroke, text, corner radius)
- [x] Implement node management commands (delete, clone, group, rename)
- [x] Implement export command
- [x] Implement auto-layout commands
- [x] Implement style/variable read commands
- [x] Implement node serialization with depth limiting
- [x] Implement progress tracking for batch operations
- [x] Test plugin loads in Figma Desktop via manifest import
- [x] Test WS connection from plugin to server

## Success Criteria
- Plugin loads in Figma Desktop without errors
- Plugin connects to WS server with token auth
- All MVP commands execute and return results
- Text creation handles font loading correctly
- Node serialization respects depth limits (prevent huge payloads)
- Export returns base64 image data

## Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| Font not available | Medium | Fallback to "Inter" (bundled with Figma), catch error |
| Large document → huge serialization | High | Depth limit (default 3), node count limit |
| Variables API blocked on free tier | Medium | Graceful degradation, skip with warning |
| Plugin code.ts too large | Medium | Split into command handler modules, compile with tsup |

## Security Considerations
- Never log token in plugin console
- Validate all command params before executing Figma API calls
- Limit export image size to prevent memory issues
- Node serialization excludes binary data by default
