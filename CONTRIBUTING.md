# Contributing to mcp-figma

Thanks for your interest in contributing! This guide will help you get started.

## Project Structure

```
mcp-figma/
├── src/
│   ├── mcp-server/          # MCP server (stdio transport)
│   │   ├── index.ts         # Entry point, tool registration
│   │   ├── ws-client.ts     # WebSocket client for Figma communication
│   │   └── tools/           # MCP tool definitions (one file per category)
│   ├── websocket/           # WebSocket relay server
│   │   ├── ws-server.ts     # Server with auth, channels, heartbeat
│   │   ├── ws-auth.ts       # Token authentication
│   │   └── ws-server.test.ts
│   ├── figma-plugin/        # Figma Desktop plugin
│   │   ├── code.js          # Command dispatcher (plain JS — Figma sandbox)
│   │   ├── ui.html          # Plugin UI with WebSocket client
│   │   └── manifest.json    # Plugin configuration
│   └── shared/              # Shared between server and WS
│       ├── constants.ts     # Configuration constants
│       ├── message-schema.ts # Zod schemas for WS messages
│       └── sanitize.ts      # Input sanitization
├── plans/                   # Implementation plans and research
└── dist/                    # Build output (gitignored)
```

## Development Setup

```bash
# 1. Clone and install
git clone https://github.com/tranhoangtu-it/mcp-figma.git
cd mcp-figma
npm install

# 2. Build
npm run build

# 3. Run tests
npm test

# 4. Development (watch mode)
npm run dev
```

## How It Works

```
AI Client → MCP (stdio) → MCP Server → WebSocket (localhost) → Figma Plugin → Figma Canvas
```

Three components run simultaneously:
1. **WebSocket Server** (`npm run ws`) — relay with token auth
2. **Figma Plugin** — imported into Figma Desktop from `src/figma-plugin/manifest.json`
3. **MCP Server** (`npm run start`) — connects to WS, exposes tools to AI

## Adding a New Tool

### 1. Add command handler in plugin (`src/figma-plugin/code.js`)

```javascript
function cmdMyNewCommand(params) {
  var node = figma.getNodeById(params.nodeId);
  if (!node) return { error: "Node not found" };
  // Do something with Figma API
  return { id: node.id, /* result data */ };
}
```

Register it in `COMMAND_HANDLERS`:
```javascript
const COMMAND_HANDLERS = {
  // ...existing commands
  "my_new_command": cmdMyNewCommand,
};
```

### 2. Add MCP tool definition (`src/mcp-server/tools/`)

Pick the appropriate file (or create a new category):

```typescript
server.tool("my_new_command", "Description of what it does", {
  nodeId: z.string().describe("Node ID"),
}, async (params) => execFigmaCommand(client, "my_new_command", params));
```

### 3. Register in `src/mcp-server/index.ts` (if new file)

```typescript
import { registerMyTools } from "./tools/my-tools.js";
registerMyTools(server, wsClient);
```

### 4. Build and test

```bash
npm run build
npm test
```

## Important Conventions

| Convention | Details |
|---|---|
| **Colors** | Figma uses RGBA 0-1 range (not 0-255) |
| **Plugin code** | Plain JavaScript only (WASM sandbox, no TS/modules) |
| **Logging** | Always `console.error()` — stdout is reserved for MCP protocol |
| **Font loading** | Call `figma.loadFontAsync()` before editing text nodes |
| **Node serialization** | Use depth limits to prevent huge payloads |
| **Error handling** | Use `execFigmaCommand()` helper (auto try/catch) |
| **File naming** | kebab-case for all TS files |
| **Message IDs** | `crypto.randomUUID()` for request/response correlation |

## Security Guidelines

- **Never** use `child_process.exec()` with design data (injection risk)
- **Always** use `execFile()` if system calls are needed
- **Always** validate inputs with Zod schemas
- **Never** store secrets in plugin code (publicly readable)
- **Always** bind WebSocket to `127.0.0.1` (not `0.0.0.0`)
- Token comparison must use `crypto.timingSafeEqual()`

## Running Tests

```bash
npm test              # All tests
npm run test:ws       # WebSocket server tests only
```

Tests use Node.js built-in test runner with tsx. Figma Plugin API cannot be tested outside Figma Desktop — manual integration testing required.

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new tool for gradient fills
fix: handle missing font fallback in text creation
docs: update setup instructions for Windows
refactor: extract node serialization into shared module
test: add channel isolation test
```

## Pull Requests

1. Fork the repo and create a feature branch
2. Make your changes following the conventions above
3. Ensure `npm run build` and `npm test` pass
4. Submit a PR with a clear description of what changed and why

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Your environment (OS, Node.js version, Figma Desktop version)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
