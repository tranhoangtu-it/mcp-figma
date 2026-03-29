# mcp-figma

MCP server that bridges AI clients (Claude, Cursor, GPT) to **Figma Desktop** via Plugin API + WebSocket. Zero rate limits, free, real-time design manipulation.

## Architecture

```
AI Client → MCP (stdio) → MCP Server → WebSocket (127.0.0.1) → Figma Plugin → Figma Canvas
```

Unlike REST API-based solutions (6 calls/month on free tier), this uses **Figma Plugin API** which has **no rate limits** and is **free**.

## Prerequisites

- Node.js 18+
- Figma Desktop app

## Setup

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Start WebSocket Server

```bash
npm run ws
```

This outputs a **session token** — copy it for the next steps.

### 3. Import Figma Plugin

1. Open Figma Desktop
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Select `src/figma-plugin/manifest.json`
4. Run the plugin from the Plugins menu
5. Paste the session token and click **Connect**

### 4. Configure MCP Client

Set environment variable `MCP_FIGMA_TOKEN` to the session token from step 2.

**Claude Code** (`.mcp.json`):
```json
{
  "mcpServers": {
    "mcp-figma": {
      "command": "node",
      "args": ["dist/mcp-server/index.js"],
      "cwd": "/path/to/mcp-figma",
      "env": {
        "MCP_FIGMA_TOKEN": "paste-token-here"
      }
    }
  }
}
```

**Cursor** (MCP settings):
```json
{
  "mcp-figma": {
    "command": "node",
    "args": ["dist/mcp-server/index.js"],
    "env": {
      "MCP_FIGMA_TOKEN": "paste-token-here"
    }
  }
}
```

## Available Tools (25)

### Document
- `get_document_info` — Document name, pages, structure
- `get_selection` — Currently selected nodes
- `get_node_info` — Detailed node properties
- `get_page_nodes` — Page children tree
- `scan_text_nodes` — Find all text nodes
- `scan_nodes_by_type` — Find nodes by type

### Create
- `create_frame` — Frame with auto-layout support
- `create_rectangle` — Rectangle with fill/corner radius
- `create_text` — Text node (Inter font default)
- `create_ellipse` — Ellipse/circle

### Modify
- `move_node` — Reposition
- `resize_node` — Resize
- `set_name` — Rename
- `set_corner_radius` — Round corners
- `delete_node` — Remove
- `clone_node` — Duplicate
- `group_nodes` — Group together
- `set_auto_layout` — Configure auto-layout

### Style
- `set_fill_color` — Solid fill (RGBA 0-1)
- `set_stroke` — Stroke color + width
- `set_text_content` — Update text
- `set_font_size` — Change font size
- `set_opacity` — Node opacity
- `get_local_styles` — List paint/text styles

### Export
- `export_node` — Export as PNG/SVG/PDF (base64)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_FIGMA_TOKEN` | (required) | Session token from WS server |
| `MCP_FIGMA_PORT` | `3055` | WebSocket server port |
| `MCP_FIGMA_CHANNEL` | `mcp-figma` | Channel name |

## Development

```bash
npm run dev       # Watch mode (rebuild on change)
npm run ws        # Start WebSocket server
npm run test      # Run tests
npm run test:ws   # Run WebSocket tests only
```

## Security

- WebSocket binds to `127.0.0.1` only (no remote access)
- Per-session token authentication required
- All messages validated against schemas
- Rate limiting (100 msg/sec per client)
- Heartbeat detection for dead connections

## License

MIT
