# mcp-figma

MCP server that bridges AI clients (Claude, Cursor, GPT) to **Figma Desktop** via Plugin API + WebSocket. Zero rate limits, free, real-time design manipulation.

## Why This Exists

Figma's REST API is rate-limited (6 calls/month on free tier) and existing MCP servers all wrap that same API. **mcp-figma** takes a different approach — it uses the **Figma Plugin API** running inside your desktop app, which has **no rate limits** and is **completely free**.

## How It Works

```
┌─────────────┐     stdio      ┌──────────────┐   WebSocket    ┌──────────────┐
│  AI Client   │ ────────────▶ │  MCP Server  │ ◀───────────▶ │ Figma Plugin │
│  (Claude,    │               │  (Node.js)   │  127.0.0.1    │ (Desktop)    │
│   Cursor,    │               │  25 tools    │  token auth   │ Plugin API   │
│   GPT...)    │               └──────────────┘               └──────┬───────┘
└─────────────┘                                                      │
                                                               ┌─────▼──────┐
                                                               │   Figma    │
                                                               │   Canvas   │
                                                               └────────────┘
```

**Three components run simultaneously:**

| Component | What it does | How to start |
|-----------|-------------|--------------|
| **WebSocket Server** | Relay with token auth + channel routing | `npm run ws` |
| **Figma Plugin** | Executes commands inside Figma Desktop | Import in Figma |
| **MCP Server** | Exposes 25 design tools to AI via stdio | Configure in AI client |

## Quick Start

### Prerequisites

- **Node.js 18+** ([download](https://nodejs.org/))
- **Figma Desktop** ([download](https://www.figma.com/downloads/))

### Step 1: Install & Build

```bash
git clone https://github.com/tranhoangtu-it/mcp-figma.git
cd mcp-figma
npm install
npm run build
```

### Step 2: Start WebSocket Server

```bash
npm run ws
```

Output:
```
[ws] WebSocket server listening on 127.0.0.1:3055
[ws] Session token: abc123...   ← Copy this token!
```

### Step 3: Import Figma Plugin

1. Open **Figma Desktop**
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Navigate to `mcp-figma/src/figma-plugin/` and select `manifest.json`
4. Run the plugin: **Plugins** → **Development** → **MCP Figma Bridge**
5. Paste the **session token** from Step 2 → Click **Connect**
6. Status dot turns green = connected

### Step 4: Configure Your AI Client

#### Claude Code

Add to your project's `.mcp.json`:
```json
{
  "mcpServers": {
    "mcp-figma": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-figma/dist/mcp-server/index.js"],
      "env": {
        "MCP_FIGMA_TOKEN": "paste-token-from-step-2"
      }
    }
  }
}
```

#### Cursor

Add to MCP settings (Settings → MCP Servers):
```json
{
  "mcp-figma": {
    "command": "node",
    "args": ["/absolute/path/to/mcp-figma/dist/mcp-server/index.js"],
    "env": {
      "MCP_FIGMA_TOKEN": "paste-token-from-step-2"
    }
  }
}
```

#### Windsurf / Other MCP Clients

Any MCP-compatible client works — configure it to run `node dist/mcp-server/index.js` with the `MCP_FIGMA_TOKEN` environment variable.

### Step 5: Try It!

Ask your AI: *"Create a login page in Figma with email input, password input, and a blue submit button"*

Watch it appear in real-time on your Figma canvas.

## Available Tools (25)

### Read Design
| Tool | Description |
|------|-------------|
| `get_document_info` | Document name, pages, current page |
| `get_selection` | Currently selected nodes |
| `get_node_info` | Detailed properties of a node by ID |
| `get_page_nodes` | All top-level nodes on a page |
| `scan_text_nodes` | Find all text nodes in subtree |
| `scan_nodes_by_type` | Find nodes by type (FRAME, TEXT, etc.) |

### Create Nodes
| Tool | Description |
|------|-------------|
| `create_frame` | Frame with position, size, fill, auto-layout |
| `create_rectangle` | Rectangle with fill and corner radius |
| `create_text` | Text node (Inter font default) |
| `create_ellipse` | Ellipse or circle |

### Modify Nodes
| Tool | Description |
|------|-------------|
| `move_node` | Move to new X/Y coordinates |
| `resize_node` | Change width and height |
| `set_name` | Rename a node |
| `set_corner_radius` | Round corners |
| `delete_node` | Remove from canvas |
| `clone_node` | Duplicate a node |
| `group_nodes` | Group multiple nodes |
| `set_auto_layout` | Configure auto-layout direction, spacing, padding |

### Style Nodes
| Tool | Description |
|------|-------------|
| `set_fill_color` | Solid fill color (RGBA 0-1) |
| `set_stroke` | Stroke color and width |
| `set_text_content` | Update text content |
| `set_font_size` | Change font size |
| `set_opacity` | Set transparency (0-1) |
| `get_local_styles` | List all local paint/text styles |

### Export
| Tool | Description |
|------|-------------|
| `export_node` | Export as PNG, SVG, or PDF (base64) |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MCP_FIGMA_TOKEN` | *(required)* | Session token from WebSocket server |
| `MCP_FIGMA_PORT` | `3055` | WebSocket server port |
| `MCP_FIGMA_CHANNEL` | `mcp-figma` | Channel name for communication |

## Development

```bash
npm run build     # Build with tsup
npm run dev       # Watch mode (auto-rebuild)
npm run ws        # Start WebSocket relay server
npm run start     # Start MCP server (needs MCP_FIGMA_TOKEN)
npm test          # Run all tests
npm run test:ws   # Run WebSocket tests only
```

## Security

| Measure | Details |
|---------|---------|
| **Localhost only** | WebSocket binds to `127.0.0.1` — no remote access |
| **Token auth** | Per-session random token, timing-safe comparison |
| **Channel isolation** | Clients can only message their own channel |
| **Schema validation** | All messages validated with Zod before processing |
| **Input sanitization** | Design data sanitized before reaching AI |
| **Rate limiting** | 100 messages/sec per client |
| **Heartbeat** | Dead connections detected and cleaned up |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Plugin won't connect | Check token matches, WS server is running, port 3055 not blocked |
| "Font not found" error | Figma defaults to Inter — ensure it's installed or specify available font |
| MCP server exits immediately | Check `MCP_FIGMA_TOKEN` is set and WS server is running |
| Tools timeout after 30s | Ensure Figma plugin is connected (green status dot) |
| Port 3055 in use | Set `MCP_FIGMA_PORT=3056` for both WS server and MCP client config |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, conventions, and how to add new tools.

## License

[MIT](LICENSE)
