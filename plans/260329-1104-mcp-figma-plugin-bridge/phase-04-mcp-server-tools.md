# Phase 4: MCP Server & Tools

## Overview
- **Priority:** P0
- **Status:** completed
- **Effort:** Large
- **Description:** MCP server exposing design tools to AI clients via stdio transport. Connects to WebSocket server as client, translates MCP tool calls → WS commands → Figma plugin.

## Key Insights
- MCP SDK uses stdio transport (stdout for protocol, stderr for logging)
- Each tool: Zod schema → async handler → send command to Figma via WS → await response
- Grab uses 50+ tools; we start with ~25 essential tools, modular structure for growth
- 30s timeout per command with progress update reset
- UUID correlation for request-response matching over async WS

## Context Links
- [TalkToFigma Deep Dive](../reports/researcher-260329-1104-talktofigma-deep-dive.md) — Tool patterns, Zod schemas

## Architecture

```
┌──────────────────────────────────────────────────┐
│                MCP Server                         │
│                                                    │
│  ┌──────────────────┐                              │
│  │ StdioTransport   │ ← AI client (Claude, etc.)  │
│  └────────┬─────────┘                              │
│  ┌────────▼─────────┐                              │
│  │ Tool Registry    │ 25+ tools with Zod schemas  │
│  │ ├── document-tools.ts                           │
│  │ ├── creation-tools.ts                           │
│  │ ├── modification-tools.ts                       │
│  │ ├── style-tools.ts                              │
│  │ └── export-tools.ts                             │
│  └────────┬─────────┘                              │
│  ┌────────▼─────────┐                              │
│  │ Command Sender   │ UUID tracking, timeout      │
│  │ (WS Client)      │ 30s timeout, progress reset │
│  └──────────────────┘                              │
└──────────────────────────────────────────────────┘
```

## Related Code Files
- Create: `src/mcp-server/index.ts` — entry point, server setup
- Create: `src/mcp-server/ws-client.ts` — WebSocket client + command sender
- Create: `src/mcp-server/tools/document-tools.ts` — read operations
- Create: `src/mcp-server/tools/creation-tools.ts` — create nodes
- Create: `src/mcp-server/tools/modification-tools.ts` — modify nodes
- Create: `src/mcp-server/tools/style-tools.ts` — colors, strokes, effects
- Create: `src/mcp-server/tools/export-tools.ts` — image export
- Modify: `src/shared/message-schema.ts` — add tool-specific schemas if needed

## Implementation Steps

### 4.1 MCP Server Entry Point (`src/mcp-server/index.ts`)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "mcp-figma",
  version: "0.1.0",
  capabilities: { tools: {} }
});

// Register all tools
registerDocumentTools(server);
registerCreationTools(server);
registerModificationTools(server);
registerStyleTools(server);
registerExportTools(server);

// Connect via stdio
const transport = new StdioServerTransport();
await server.connect(transport);
```

### 4.2 WebSocket Client (`src/mcp-server/ws-client.ts`)

Responsibilities:
- Connect to WS server on startup (read port + token from env or config)
- Auth handshake
- Join channel
- Send command, track by UUID, await response with timeout
- Handle progress updates (reset timeout timer)

```typescript
async function sendCommand(command: string, params: any, timeout = 30000): Promise<any> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeout);

    pendingRequests.set(id, {
      resolve: (result) => { clearTimeout(timer); resolve(result); },
      reject: (err) => { clearTimeout(timer); reject(err); },
      resetTimeout: () => {
        clearTimeout(timer);
        // Reset with new timer on progress update
      }
    });

    ws.send(JSON.stringify({
      type: "message",
      channel: currentChannel,
      message: { command, params, id }
    }));
  });
}
```

### 4.3 Tool Modules

#### document-tools.ts — Read Operations

| Tool | Parameters | Description |
|---|---|---|
| `get_document_info` | — | Document name, pages, structure |
| `get_selection` | — | Currently selected nodes |
| `get_node_info` | `nodeId`, `depth?` | Read node + children |
| `get_page_nodes` | `pageId?`, `depth?` | Page children tree |
| `scan_text_nodes` | `parentId?` | Find all text nodes |
| `scan_nodes_by_type` | `types[]`, `parentId?` | Find nodes by type |

#### creation-tools.ts — Create Nodes

| Tool | Key Parameters | Description |
|---|---|---|
| `create_frame` | `x, y, width, height, name?, fillColor?, parentId?` | Create frame |
| `create_rectangle` | `x, y, width, height, name?, fillColor?, parentId?` | Create rectangle |
| `create_text` | `text, x, y, fontSize?, fontFamily?, name?, parentId?` | Create text |
| `create_ellipse` | `x, y, width, height, name?, parentId?` | Create ellipse |

Color params use 0-1 RGBA:
```typescript
fillColor: z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1).optional().default(1)
}).optional()
```

#### modification-tools.ts — Modify Nodes

| Tool | Key Parameters | Description |
|---|---|---|
| `move_node` | `nodeId, x, y` | Reposition |
| `resize_node` | `nodeId, width, height` | Resize |
| `set_name` | `nodeId, name` | Rename |
| `set_corner_radius` | `nodeId, radius` | Round corners |
| `delete_node` | `nodeId` | Remove |
| `clone_node` | `nodeId, parentId?` | Duplicate |
| `group_nodes` | `nodeIds[]` | Group together |
| `set_auto_layout` | `nodeId, mode, spacing?, padding?` | Configure auto-layout |

#### style-tools.ts — Styling

| Tool | Key Parameters | Description |
|---|---|---|
| `set_fill_color` | `nodeId, r, g, b, a?` | Solid fill (0-1 RGBA) |
| `set_stroke` | `nodeId, r, g, b, width, a?` | Stroke color + width |
| `set_text_content` | `nodeId, text` | Update text |
| `set_font_size` | `nodeId, fontSize` | Change font size |
| `set_opacity` | `nodeId, opacity` | Node opacity (0-1) |
| `get_local_styles` | — | List local paint/text styles |

#### export-tools.ts — Export

| Tool | Key Parameters | Description |
|---|---|---|
| `export_node` | `nodeId, format?, scale?` | Export PNG/SVG/PDF as base64 |

### 4.4 Tool Registration Pattern

Each module exports a `register` function:

```typescript
// creation-tools.ts
export function registerCreationTools(server: McpServer) {
  server.tool(
    "create_frame",
    "Create a new frame in Figma with position, size, optional fill color and auto-layout",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().min(1).describe("Width"),
      height: z.number().min(1).describe("Height"),
      name: z.string().optional().describe("Frame name"),
      fillColor: colorSchema.optional(),
      parentId: z.string().optional().describe("Parent node ID"),
      layoutMode: z.enum(["NONE","HORIZONTAL","VERTICAL"]).optional(),
    },
    async (params) => {
      const result = await sendCommand("create_frame", params);
      return [{ type: "text", text: JSON.stringify(result) }];
    }
  );
  // ... more tools
}
```

## Todo List
- [x] Create MCP server entry point with stdio transport
- [x] Implement WS client with auth + UUID tracking + timeout
- [x] Implement document-tools (6 tools)
- [x] Implement creation-tools (4 tools)
- [x] Implement modification-tools (8 tools)
- [x] Implement style-tools (6 tools)
- [x] Implement export-tools (1 tool)
- [x] Verify all tools register without errors
- [x] Test MCP server starts and lists tools via `npx @modelcontextprotocol/inspector`

## Success Criteria
- MCP server starts via stdio, lists 25+ tools
- Each tool validates params with Zod schemas
- Command sender correctly correlates request/response via UUID
- Timeout works (30s default, reset on progress)
- All logging goes to stderr

## Risk Assessment
| Risk | Severity | Mitigation |
|---|---|---|
| WS disconnected mid-command | Medium | Auto-reconnect, reject pending commands with error |
| Large response exceeds MCP token limit | Medium | Depth limit on node reads, truncation warning |
| Tool name conflicts with other MCP servers | Low | Prefix consideration (keep short for now, no prefix) |
