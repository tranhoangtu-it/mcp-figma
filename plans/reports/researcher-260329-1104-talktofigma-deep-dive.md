# Research Report: grab/cursor-talk-to-figma-mcp Deep Dive

**Date:** 2026-03-29
**Report ID:** researcher-260329-1104-talktofigma-deep-dive
**Project:** MCP Figma Integration Implementation
**Scope:** Complete technical analysis of cursor-talk-to-figma-mcp repository structure, patterns, and implementation details

---

## Executive Summary

The `grab/cursor-talk-to-figma-mcp` repository is a mature, production-ready integration system (v0.3.5) that enables AI agents (Cursor, Claude Code) to programmatically read and modify Figma designs via the Model Context Protocol (MCP). The system implements a three-tier architecture: MCP Server → WebSocket Relay → Figma Plugin, using Bun/TypeScript and exposing 50+ design manipulation tools.

**Key takeaway:** The architecture is well-structured with clear separation of concerns. The WebSocket relay uses channel-based isolation with zero-echo message routing. All tool inputs are validated via Zod schemas. Color values use Figma's native 0-1 RGBA range. The Figma plugin operates within strict security constraints requiring `dynamic-page` documentAccess.

---

## 1. EXACT PROJECT STRUCTURE

### Directory Layout

```
cursor-talk-to-figma-mcp/
├── src/
│   ├── talk_to_figma_mcp/
│   │   └── server.ts                 # MCP server with 50+ tool definitions
│   ├── cursor_mcp_plugin/
│   │   ├── manifest.json             # Figma plugin configuration
│   │   ├── code.js                   # Plugin command dispatcher & Figma API calls
│   │   └── ui.html                   # WebSocket connection UI (837 lines)
│   └── socket.ts                     # WebSocket relay server (Bun)
├── dist/                             # Built output (tsup compiled)
├── scripts/
│   └── setup.sh                      # Automated MCP configuration
├── .mcp.json                         # MCP config for Claude Code
├── tsconfig.json                     # TypeScript compilation settings
├── tsup.config.ts                    # Build configuration
├── package.json                      # Dependencies (v0.3.5)
├── bun.lock                          # Lock file
├── CLAUDE.md                         # Development guidelines
├── AGENTS.md                         # Agent documentation
├── README.md                         # Setup & usage guide
├── LICENSE                           # MIT
├── Dockerfile                        # Container configuration
└── smithery.yaml                     # Smithery marketplace config
```

### Key Files Purpose

| File | Purpose | Size/Notes |
|------|---------|-----------|
| `server.ts` | Main MCP server, tool registration, WebSocket client logic | ~1500 lines, exports `main()` |
| `socket.ts` | Bun WebSocket server, channel routing, message broadcast | ~200 lines, port 3055 |
| `code.js` | Figma plugin code, handles 30+ commands, Figma API dispatch | Large dispatcher function |
| `ui.html` | Plugin UI, WS connection mgmt, status display, config copy | 837 lines, self-contained |
| `manifest.json` | Figma plugin metadata, permissions, network access | ~20 lines |

---

## 2. PACKAGE.JSON DEPENDENCIES

### Dependency Matrix

```json
{
  "version": "0.3.5",
  "type": "module",
  "main": "dist/server.js",
  "bin": "dist/server.js",

  "dependencies": {
    "@modelcontextprotocol/sdk": "1.13.1",  // MCP server framework
    "uuid": "latest",                       // Request ID generation
    "ws": "latest",                         // WebSocket client (for MCP ↔ relay)
    "zod": "3.22.4"                         // Schema validation for tool parameters
  },

  "devDependencies": {
    "@types/bun": "latest",                 // Bun runtime types
    "bun-types": "^1.2.5",                  // Bun type definitions
    "tsup": "^8.4.0",                       // TypeScript bundler
    "typescript": "^5.0.0"                  // TypeScript compiler
  }
}
```

### Build & Runtime Scripts

```json
{
  "scripts": {
    "build": "tsup",                    // Compile src/ to dist/
    "build:watch": "tsup --watch",      // Watch mode for dev
    "dev": "bun run build:watch",       // Dev workflow
    "start": "bun run dist/server.js",  // Run compiled MCP server
    "socket": "bun run src/socket.ts",  // Run WebSocket relay (uncompiled)
    "setup": "./scripts/setup.sh",      // Configure MCP for Cursor/Claude Code
    "pub:release": "bun run build && npm publish"  // Publish to npm
  }
}
```

### Build Output

- **Bundler:** tsup (TypeScript bundler)
- **Entry point:** `src/talk_to_figma_mcp/server.ts`
- **Output format:** CommonJS + ESM (dual bundle)
- **Node target:** 18+
- **Minify:** disabled (for debugging)
- **Sourcemaps:** enabled
- **Output dir:** `dist/` (contains `server.js` and `server.d.ts`)

---

## 3. WEBSOCKET IMPLEMENTATION DEEP DIVE

### Server Architecture

**Location:** `src/socket.ts`
**Runtime:** Bun
**Port:** 3055 (configurable)
**Protocol:** JSON-over-WS with channel-based routing

### Connection Flow

```
MCP Server              WebSocket Relay           Figma Plugin UI
    |                       |                           |
    | connect (WS)          |                           |
    |-------------------→   |                           |
    |                       | connect (WS)             |
    |                       |←--------------------------|
    | {"type":"join",       |                           |
    |   "channel":"ch1"}    | {"type":"join",           |
    |-------------------→   | "channel":"ch1"}         |
    |                       |---no echo to sender----→  |
    | {"type":"message",    |                           |
    |   "channel":"ch1",    | broadcast to OTHER       |
    |   "message":{...}}    | clients in ch1            |
    |-------------------→   |------------------------→  |
```

### Message Format

All messages are JSON with this structure:

```typescript
{
  type: "join" | "message" | "progress_update" | "system" | "error",
  channel: string,                           // Channel identifier
  message?: {                                // Payload
    command?: string,                        // Command name
    params?: Record<string, any>,            // Command parameters
    result?: any,                            // Response data
    error?: string,                          // Error message
    id?: string                              // Request correlation ID
  },
  id?: string                                // Unique request ID (UUID)
}
```

### Channel Management

**Data structure:** `Map<string, Set<ServerWebSocket>>`

**Operations:**
- **join:** Client sends `{type: "join", channel: "myChannel"}` → server adds client to channel set, broadcasts "user joined" to OTHER members
- **message:** Client sends `{type: "message", channel: "myChannel", message: {...}}` → server broadcasts to ALL OTHER clients in channel (not back to sender)
- **disconnect:** Server automatically removes client from all channel sets on close

**Key behavior:** Messages do NOT echo back to sender. This creates a natural request-response pattern where the sender knows they initiated and can track responses without confusion.

### Event Handlers

```typescript
// On incoming message
if (msg.type === "join") {
  // Create channel if not exists, add client, notify others
  if (!channels.has(channel)) channels.set(channel, new Set());
  channels.get(channel).add(client);
  // Broadcast: {type: "system", message: "User joined"}
}

if (msg.type === "message") {
  // Broadcast to OTHER clients in channel
  channels.get(channel).forEach(c => {
    if (c !== client) c.send(JSON.stringify(msg));
  });
}

// On disconnect
client.onclose = () => {
  channels.forEach(set => set.delete(client));
}
```

### Timeout & Activity Management

- Default timeout: 30 seconds for MCP requests
- Progress updates from plugin reset inactivity timer
- Orphaned requests are garbage-collected by timeout handler

---

## 4. FIGMA PLUGIN STRUCTURE

### manifest.json

```json
{
  "name": "Cursor MCP Plugin",
  "id": "1485687494525374295",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma", "figjam"],
  "permissions": [],
  "networkAccess": {
    "allowedDomains": ["http://localhost:3055"],
    "devAllowedDomains": ["http://localhost:3055"]
  },
  "documentAccess": "dynamic-page"
}
```

**Critical fields:**
- `editorType: ["figma", "figjam"]` — Works in both Figma and FigJam
- `permissions: []` — No special Figma permissions needed (plugin reads from current selection only)
- `documentAccess: "dynamic-page"` — **REQUIRED** for new plugins; enables page switching
- `networkAccess.allowedDomains` — Specifies localhost:3055 for WebSocket access

### code.js Structure

**Responsibility:** Dispatcher that receives messages from UI and executes Figma API calls.

**Message handler pattern:**
```javascript
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case "execute-command":
      const result = await handleCommand(msg.command, msg.params);
      figma.ui.postMessage({
        type: "command-result",
        id: msg.id,
        result: result
      });
      break;
    case "update-settings":
      // Update plugin configuration
      break;
    case "notify":
      figma.notify(msg.text);
      break;
    case "close-plugin":
      figma.closePlugin();
      break;
  }
};
```

**Command dispatcher:** `handleCommand(command, params)` routes 30+ operations:
- Node operations: create, move, resize, delete, clone
- Styling: fill, stroke, corner radius, shadow
- Text: scan, replace, batch update
- Components: instance creation, override management
- Annotations: create, batch set
- Layout: auto-layout config, padding, alignment, spacing
- Prototypes: reactions, connections

**Progress tracking:**
```javascript
const sendProgressUpdate = (status, message, percentage, result) => {
  figma.ui.postMessage({
    type: "command_progress",
    status: status,      // "in_progress" | "completed" | "error"
    message: message,    // User-visible status
    percentage: percentage,  // 0-100
    result: result       // Partial or final result object
  });
};
```

### ui.html Structure

**File size:** 837 lines of self-contained HTML/CSS/JavaScript

**Key components:**

1. **WebSocket Connection Manager:**
   - Connects to `ws://localhost:3055` by default
   - Port configurable via input field
   - Handles `onopen`, `onmessage`, `onclose`, `onerror`

2. **Tab Navigation:**
   - "Connection" tab: status, port config, MCP config display
   - "About" tab: version, usage instructions, GitHub link

3. **Connection Status Display:**
   - Color-coded indicator: green (connected), red (disconnected), blue (connecting)
   - Shows MCP configuration (copyable JSON)

4. **Progress Tracking:**
   - Real-time operation status
   - Progress bar (0-100%)
   - Completion indicators

5. **Message Handler:**
   ```javascript
   window.onmessage = (event) => {
     const msg = event.data;
     switch (msg.type) {
       case "connection-status":
         updateStatusUI(msg.status);
         break;
       case "command-result":
         handleCommandResult(msg.id, msg.result);
         break;
       case "command_progress":
         updateProgressBar(msg.percentage, msg.message);
         break;
     }
   };
   ```

**Critical pattern:** Plugin UI ↔ Plugin Code uses `figma.ui.postMessage()` and `figma.ui.onmessage()`. UI ↔ MCP Server uses WebSocket JSON messages.

---

## 5. MCP SERVER TOOLS & SIGNATURES

### Tool Registration Pattern

All tools follow this pattern:

```typescript
server.tool(
  "tool_name",
  "Human-readable description",
  {
    param1: z.string().describe("Description"),
    param2: z.number().min(0).max(1).describe("Numeric constraint"),
    param3: z.enum(["OPTION_A", "OPTION_B"]).optional(),
  },
  async (params) => {
    try {
      const result = await sendCommandToFigma("tool_name", params);
      return [{type: "text", text: JSON.stringify(result)}];
    } catch (error) {
      return [{type: "text", text: `Error: ${error.message}`}];
    }
  }
);
```

### Core Tool Categories (50+)

#### Document Operations
- `get_document_info()` — Retrieve entire document structure
- `get_nodes_info(nodeIds: string[])` — Batch fetch node data
- `get_node_info(nodeId: string)` — Single node details
- `scan_text_nodes(parentId?: string)` — Find all text in subtree
- `scan_nodes_by_types(types: string[])` — Find nodes by type

#### Creation Tools
- `create_rectangle(x, y, width, height, name?, parentId?)` — Create rect
- `create_frame(x, y, width, height, fillColor?, layoutMode?, ...)` — Create frame
- `create_text(text, x, y, fontSize?, fontName?, name?, ...)` — Create text node
- `create_ellipse(x, y, width, height, ...)` — Create ellipse

#### Modification Tools
- `move_node(nodeId, x, y)` — Move by coordinates
- `resize_node(nodeId, width, height)` — Change dimensions
- `set_corner_radius(nodeId, radius)` — Round corners
- `delete_node(nodeId)` — Remove node
- `clone_node(nodeId, parentId?)` — Duplicate node

#### Color & Styling
- `set_fill_color(nodeId, r, g, b, a?)` — Apply fill (RGBA 0-1)
- `set_stroke_color(nodeId, r, g, b, a?)` — Apply stroke
- `set_stroke_width(nodeId, width)` — Stroke thickness

#### Component Management
- `create_component_instance(componentNodeId, parentId?, overrides?)` — Create instance
- `get_instance_overrides(nodeId)` — Read instance customizations
- `set_instance_overrides(nodeId, overrides)` — Update instance values

#### Text Operations
- `set_text_content(nodeId, text)` — Single text node update
- `set_multiple_text_contents(updates: {nodeId, text}[])` — Batch text with chunking
- `scan_text_nodes(parentId?)` — Enumerate all text

#### Annotations
- `create_annotation(nodeId, labelMarkdown, categoryId?)` — Single annotation
- `set_multiple_annotations(annotations: [{nodeId, labelMarkdown, ...}][])` — Batch annotations

#### Layout Control
- `set_layout_mode(nodeId, mode: "NONE" | "HORIZONTAL" | "VERTICAL")` — Enable auto-layout
- `set_padding(nodeId, top, right, bottom, left)` — Internal spacing
- `set_item_spacing(nodeId, spacing)` — Gap between items
- `set_axis_align(nodeId, itemSpacing, align)` — Item alignment

#### Advanced Features
- `export_node_as_image(nodeId, format)` — Multi-format export
- `get_reactions(nodeId)` — Prototype interactions
- `create_connections(connectionData)` — Flow connectors

### Parameter Validation (Zod Schemas)

**Numeric ranges (colors, 0-1 bounded):**
```typescript
r: z.number().min(0).max(1).describe("Red (0-1)"),
g: z.number().min(0).max(1),
b: z.number().min(0).max(1),
a: z.number().min(0).max(1).optional().default(1)
```

**Enumerated values:**
```typescript
editorType: z.enum(["figma", "figjam"]).describe("Target editor"),
layoutMode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]),
textAlign: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
```

**Optional parameters:**
```typescript
name: z.string().optional().describe("Optional node name"),
parentId: z.string().optional().describe("Parent container ID")
```

**Arrays for batch operations:**
```typescript
annotations: z.array(
  z.object({
    nodeId: z.string(),
    labelMarkdown: z.string(),
    categoryId: z.string().optional()
  })
).describe("Array of annotations to apply")
```

### WebSocket Communication Flow

```
MCP Server (requests)              WebSocket Relay            Figma Plugin (handlers)
    |                                    |                            |
    | {"type":"join","channel":"ch1"}   |                            |
    |---------------------------------→  | {"type":"join"...}        |
    |                                    |-------------------------→  |
    | {"type":"message",                |                            |
    |  "message":{                       | broadcast to ch1 members   |
    |    "command":"create_rectangle",   |--------------------------→| Plugin receives
    |    "params":{...},                 |                            | command message
    |    "id":"uuid-xxx"                 |                            |
    |  }}                                |                            |
    |---------------------------------→  |                            |
    |                                    |                            | handleCommand()
    |                                    |                            | executes Figma API
    |                                    |                            |
    |                                    | UI progress updates        |
    | {"type":"progress_update",         |←---------------------------|
    |  "message":{...}}                  |                            |
    |←------------------------------------|                            |
    | ... (waits for result)             |                            |
    |                                    | Final result               |
    | {"type":"message",                 |←---------------------------|
    |  "message":{                       |                            |
    |    "result":{...},                 |                            |
    |    "id":"uuid-xxx"                 |                            |
    |  }}                                |                            |
    |←------------------------------------|                            |
    | Promises resolve → tool returns    |                            |
```

### Request Lifecycle

```typescript
// In server.ts
const pendingRequests = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
  lastActivity: number;
}>();

async function sendCommandToFigma(command: string, params: any) {
  const id = uuid();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Command ${command} timed out after 30s`));
    }, 30000);

    pendingRequests.set(id, { resolve, reject, timeout, lastActivity: Date.now() });

    // Send via WebSocket
    ws.send(JSON.stringify({
      type: "message",
      channel: DEFAULT_CHANNEL,
      message: { command, params, id }
    }));
  });
}

// On incoming response from plugin
ws.on("message", (data) => {
  const msg = JSON.parse(data);

  if (msg.message?.id && pendingRequests.has(msg.message.id)) {
    const pending = pendingRequests.get(msg.message.id);

    if (msg.message.error) {
      pending.reject(new Error(msg.message.error));
    } else {
      pending.resolve(msg.message.result);
    }

    clearTimeout(pending.timeout);
    pendingRequests.delete(msg.message.id);
  }
});
```

---

## 6. BUILD & RUN PROCESS

### Build Workflow

```bash
# Install dependencies
bun install

# Development with file watching
bun run dev                          # Runs tsup --watch

# Production build
bun run build                        # tsup compiles to dist/

# Run compiled MCP server
bun run start                        # Executes dist/server.js

# Run WebSocket relay (uncompiled for faster iteration)
bun run socket                       # Runs src/socket.ts directly
```

### Build Configuration (tsup.config.ts)

```typescript
export default defineConfig({
  entry: ['src/talk_to_figma_mcp/server.ts'],   // Single entry
  format: ['cjs', 'esm'],                       // Dual module output
  dts: true,                                    // TypeScript declarations
  clean: true,                                  // Remove dist/ before build
  outDir: 'dist',
  target: 'node18',
  sourcemap: true,                             // Debug-friendly
  minify: false,                                // Readable output
  splitting: false,                            // Single bundle
  bundle: true,                                // Include dependencies
});
```

### Setup & Installation

**Automated setup script** (`scripts/setup.sh`):

```bash
#!/bin/bash

# Define MCP configuration
MCP_CONFIG='{"TalkToFigma":{"command":"bunx","args":["cursor-talk-to-figma-mcp@latest"]}}'

# Install project dependencies
bun install

# Configure for Cursor IDE
mkdir -p .cursor
echo "$MCP_CONFIG" > .cursor/mcp.json

# Configure for Claude Code
echo "$MCP_CONFIG" > .mcp.json

echo "✓ MCP configured for Cursor and Claude Code"
```

### Runtime Startup

**For local development:**

```bash
# Terminal 1: WebSocket relay
bun run socket

# Terminal 2: MCP server (in development environment)
bun run start

# Terminal 3: Start Cursor/Claude Code
# Add Figma plugin from community marketplace or load from src/cursor_mcp_plugin/manifest.json
```

**For production (npm package):**

```bash
npm install cursor-talk-to-figma-mcp@latest

# Then configure in ~/.cursor/mcp.json or .mcp.json:
# {
#   "mcpServers": {
#     "TalkToFigma": {
#       "command": "bunx",
#       "args": ["cursor-talk-to-figma-mcp@latest"]
#     }
#   }
# }
```

### Output Files

After `bun run build`:

```
dist/
├── server.js           # Compiled MCP server (CJS + ESM)
├── server.d.ts         # TypeScript declarations
├── server.js.map       # Source map for debugging
└── ... (other assets)
```

---

## 7. @modelcontextprotocol/sdk v1.13.1

### Server Setup Pattern

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "TalkToFigmaMCP",
  version: "1.0.0",
});

// Register tools
server.tool("tool_name", "description", { /* Zod schema */ }, async (params) => {
  // Handler implementation
  return [{type: "text", text: JSON.stringify(result)}];
});

// Connect to stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Key SDK Capabilities

- **Tools:** Functions exposed to LLMs for taking actions
- **Resources:** Read-only data accessible to LLMs (URLs or inline)
- **Prompts:** Reusable templates for AI workflows
- **Transport:** Stdio (default), HTTP, WebSocket support
- **Validation:** Integrated with Zod for schema definition

### Version Notes

- Current: 1.13.1 (from package.json)
- Stable and production-ready
- Active maintenance with frequent updates
- TypeScript definitions included
- Compatible with Node.js 18+

---

## 8. FIGMA PLUGIN MANIFEST REQUIREMENTS

### Required Fields

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `name` | string | Plugin display name | "Cursor MCP Plugin" |
| `id` | string | Unique plugin identifier | "1485687494525374295" |
| `api` | string | Figma API version | "1.0.0" |
| `main` | string | Plugin code file path | "code.js" |
| `ui` | string | Plugin UI HTML file path | "ui.html" |
| `editorType` | string[] | Target editors | ["figma", "figjam"] |
| `documentAccess` | string | Page access mode | "dynamic-page" (required) |

### Optional But Recommended

| Field | Type | Purpose |
|-------|------|---------|
| `permissions` | string[] | Special Figma API permissions (empty if none needed) |
| `networkAccess` | object | Whitelist for external domains |
| `relaunchButtons` | array | Context menu buttons |

### Network Access Configuration

```json
{
  "networkAccess": {
    "allowedDomains": [
      "http://localhost:3055",    // Development
      "https://your-server.com"   // Production
    ],
    "devAllowedDomains": [
      "http://localhost:3055"     // Dev-only domains
    ]
  }
}
```

### Security Constraints

- **HTTPS requirement:** Plugins loaded from https must use `wss://` (secure WebSocket), not `ws://`
- **Content Security Policy:** Network domains must be explicitly whitelisted
- **Document access:** New plugins must use `"dynamic-page"` for page switching support
- **No iframe sandboxing:** UI code runs in same context as plugin code

---

## 9. BEST PRACTICES: FIGMA PLUGIN + WEBSOCKET

### 1. Network Access Declaration

**Always explicitly declare allowed domains in manifest.json.** Implicit wildcards cause CSP violations.

```json
{
  "networkAccess": {
    "allowedDomains": ["http://localhost:3055"],
    "devAllowedDomains": ["http://localhost:3055"]
  }
}
```

### 2. Secure WebSocket (WSS) for HTTPS

If plugin loads from `https://`, WebSocket must use `wss://` (secure). Mixing `https` + `ws://` violates CSP.

```javascript
// Detect HTTPS context
const isSecure = window.location.protocol === "https:";
const wsUrl = isSecure ? "wss://..." : "ws://localhost:3055";
const ws = new WebSocket(wsUrl);
```

### 3. Message Queue for Async Operations

MCP server should queue commands to handle async Figma API calls gracefully.

```typescript
const pendingRequests = new Map<string, PendingRequest>();

// On request
pendingRequests.set(id, { resolve, reject, timeout });

// On response
const pending = pendingRequests.get(id);
pending.resolve(result);
pendingRequests.delete(id);
```

### 4. Activity-Based Timeout Reset

Progress updates from plugin reset the inactivity timer, allowing long-running operations.

```typescript
// In plugin
sendProgressUpdate("in_progress", "Processing...", 50);
// Resets server's 30s timeout

// In server
if (msg.type === "progress_update" && pendingRequests.has(msg.id)) {
  const pending = pendingRequests.get(msg.id);
  clearTimeout(pending.timeout);
  pending.timeout = setTimeout(() => { /* new timeout */ }, 30000);
  pending.lastActivity = Date.now();
}
```

### 5. Request-Response Correlation

Use UUIDs to match requests to responses, preventing cross-talk in multi-channel environments.

```typescript
// Request
{
  "type": "message",
  "channel": "channel-1",
  "message": {
    "command": "create_rectangle",
    "params": {...},
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}

// Response
{
  "type": "message",
  "channel": "channel-1",
  "message": {
    "result": {...},
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### 6. No Echo on Broadcast

WebSocket relay should NOT send messages back to the sender. This prevents confusion and enables request-response flow.

```typescript
// Broadcast to OTHER clients only
channels.get(channel).forEach(client => {
  if (client !== sender) {  // Skip sender
    client.send(JSON.stringify(msg));
  }
});
```

### 7. Error Handling in Plugin

Plugin code.js must wrap all Figma API calls in try-catch and return structured errors.

```javascript
async function handleCommand(command, params) {
  try {
    const result = await executeCommand(command, params);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}
```

### 8. Progress Tracking for Long Operations

Send incremental progress updates for batch operations.

```javascript
const items = [...]; // 1000+ items
for (let i = 0; i < items.length; i += 100) {
  const batch = items.slice(i, i + 100);
  const results = await processBatch(batch);

  sendProgressUpdate("in_progress", `Processed ${i} of ${items.length}`, (i / items.length) * 100);
}
sendProgressUpdate("completed", "Done!", 100, { total: items.length });
```

### 9. Figma API Color Constraints

Figma uses RGBA with components in range [0, 1], not [0, 255]. Always validate and convert.

```typescript
// CORRECT: 0-1 range
const fill = { r: 1, g: 0, b: 0, a: 1 };  // Red

// WRONG: 255 range (will fail)
const fill = { r: 255, g: 0, b: 0 };  // Causes error

// Validation schema
r: z.number().min(0).max(1).describe("Red component (0-1)")
```

### 10. Zod Validation for All Inputs

Use Zod schemas in MCP server to validate all tool parameters before sending to plugin.

```typescript
const createRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  name: z.string().optional(),
});

server.tool("create_rectangle", "...", createRectSchema, async (params) => {
  // params is guaranteed valid by Zod
});
```

---

## 10. CRITICAL IMPLEMENTATION PATTERNS

### 1. Color Value Handling

**Pattern:** Figma Plugin API uses RGBA [0, 1] range.

```typescript
// MCP tool parameter
r: z.number().min(0).max(1).describe("Red (0-1)")

// Plugin code.js converts when sending to Figma
const color = { r: 1, g: 0.5, b: 0.25, a: 1 };
node.fills = [{
  type: 'SOLID',
  color: color,
  opacity: 1
}];
```

### 2. Logging to stderr (stdout Reserved)

**Pattern:** All logs via console.error() or stderr; stdout reserved for MCP protocol.

```typescript
// Correct
console.error("Debug info:", value);

// Wrong (breaks MCP protocol)
console.log("Debug info:", value);
```

### 3. Default Timeout with Progress Reset

**Pattern:** 30s default timeout, progress updates extend it.

```typescript
const TIMEOUT_MS = 30000;

pendingRequests.set(id, {
  timeout: setTimeout(() => reject("Timeout"), TIMEOUT_MS),
  lastActivity: Date.now()
});

// On progress update
clearTimeout(pending.timeout);
pending.timeout = setTimeout(() => reject("Timeout"), TIMEOUT_MS);
pending.lastActivity = Date.now();
```

### 4. Channel-Based Message Isolation

**Pattern:** Clients join named channels; messages broadcast only to others in same channel.

```typescript
// Client A joins "channel-1"
ws.send({type: "join", channel: "channel-1"});

// Client B joins "channel-1"
ws.send({type: "join", channel: "channel-1"});

// Client A sends message
ws.send({type: "message", channel: "channel-1", message: {...}});

// Result: Only Client B receives it (not A)
```

### 5. UUID-Based Request Tracking

**Pattern:** Every request gets a UUID; responses include same UUID for correlation.

```typescript
import { v4 as uuid } from 'uuid';

const requestId = uuid();
pendingRequests.set(requestId, { /* handlers */ });

ws.send(JSON.stringify({
  type: "message",
  channel: "default",
  message: { command: "...", params: {...}, id: requestId }
}));
```

### 6. Zod Schema for Tool Parameters

**Pattern:** Every tool.tool() call includes Zod schema for validation.

```typescript
import { z } from 'zod';

const schema = z.object({
  nodeId: z.string().uuid(),
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
});

server.tool("move_node", "...", schema, async (params) => {
  // params guaranteed valid by Zod
});
```

### 7. Batch Operations with Chunking

**Pattern:** For bulk operations, chunk into smaller batches with progress updates.

```typescript
const CHUNK_SIZE = 50;

async function batchProcess(items) {
  const results = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const chunkResults = await processChunk(chunk);
    results.push(...chunkResults);

    // Progress
    const percentage = ((i + CHUNK_SIZE) / items.length) * 100;
    sendProgressUpdate("in_progress", `Processed ${i + CHUNK_SIZE}/${items.length}`, percentage);
  }
  return results;
}
```

### 8. Error Handling Pattern

**Pattern:** Try-catch returns text content with error info.

```typescript
server.tool("some_tool", "...", schema, async (params) => {
  try {
    const result = await sendCommandToFigma("some_tool", params);
    return [{type: "text", text: JSON.stringify(result)}];
  } catch (error) {
    return [{type: "text", text: `Error: ${error.message}`}];
  }
});
```

---

## 11. FILE REFERENCES & CODE PATHS

### Critical Source Files

| Path | Size | Purpose |
|------|------|---------|
| `src/talk_to_figma_mcp/server.ts` | ~1500 lines | MCP server + tool definitions |
| `src/socket.ts` | ~200 lines | WebSocket relay |
| `src/cursor_mcp_plugin/code.js` | ~800+ lines | Plugin command dispatcher |
| `src/cursor_mcp_plugin/ui.html` | 837 lines | Plugin UI + WS client |
| `src/cursor_mcp_plugin/manifest.json` | ~20 lines | Plugin metadata |

### Configuration Files

| Path | Purpose |
|------|---------|
| `tsup.config.ts` | Build config (entry, format, output) |
| `tsconfig.json` | TypeScript options (target, lib, strict) |
| `package.json` | Dependencies, scripts, bin entry |
| `.mcp.json` | MCP config for Claude Code |
| `scripts/setup.sh` | Automated installation |

---

## 12. ARCHITECTURAL INSIGHTS

### Separation of Concerns

```
Cursor/Claude Code IDE
    ↓
    └─→ MCP Server (server.ts)
         ├─ Tool definitions (Zod validated)
         ├─ WebSocket client (connects to relay)
         └─ Request tracking (UUID map, timeouts)
            ↓
            └─→ WebSocket Relay (socket.ts)
                 ├─ Channel management (Map<string, Set>)
                 ├─ Message broadcasting (no-echo pattern)
                 └─ Connection lifecycle
                    ↓
                    └─→ Figma Plugin (code.js + ui.html)
                         ├─ Command dispatcher (30+ operations)
                         ├─ Figma API calls
                         └─ Progress updates
```

### Why This Design?

1. **Isolation:** Plugin runs in Figma, MCP server runs locally → no direct Figma plugin → MCP SDK coupling
2. **Reliability:** WebSocket relay handles connection state, retries, queuing
3. **Scalability:** Multiple AI agents can connect to same relay (channel-based)
4. **Testability:** Each layer has clear inputs/outputs

### Data Flow for a Create Rectangle Tool

```
Claude Code → "create_rectangle({x:100, y:50, width:200, height:150})"
    ↓
MCP Server (server.ts)
  ├─ Zod validates parameters
  ├─ Generates UUID "req-123"
  ├─ Creates Promise with timeout (30s)
  ├─ Sends via WebSocket: {
  │    type: "message",
  │    channel: "default",
  │    message: {
  │      command: "create_rectangle",
  │      params: {x: 100, y: 50, width: 200, height: 150},
  │      id: "req-123"
  │    }
  │  }
    ↓
WebSocket Relay (socket.ts)
  ├─ Receives from MCP server on channel "default"
  ├─ Broadcasts to Figma plugin (NOT back to server)
    ↓
Figma Plugin UI (ui.html)
  ├─ Receives message
  ├─ Sends via figma.ui.postMessage() to code.js
    ↓
Figma Plugin Code (code.js)
  ├─ handleCommand("create_rectangle", {...})
  ├─ const node = figma.createRectangle()
  ├─ node.x = 100, node.y = 50, etc.
  ├─ Sends result back: figma.ui.postMessage({
  │    type: "command-result",
  │    id: "req-123",
  │    result: { nodeId: "12345", name: "Rectangle 1" }
  │  })
    ↓
Plugin UI
  ├─ Sends via WebSocket: {
  │    type: "message",
  │    channel: "default",
  │    message: {
  │      result: { nodeId: "12345", ... },
  │      id: "req-123"
  │    }
  │  }
    ↓
WebSocket Relay
  ├─ Broadcasts to MCP server on channel "default"
    ↓
MCP Server
  ├─ pendingRequests.get("req-123").resolve({ nodeId: "12345", ... })
  ├─ Clears timeout
  ├─ Tool returns [{type: "text", text: "Rectangle created"}]
    ↓
Claude Code → Tool result displayed to user
```

---

## 13. UNRESOLVED QUESTIONS & GAPS

1. **Plugin auto-installation:** How does setup.sh handle Figma plugin ID registration? Does user need to publish to marketplace or can they load from manifest.json file directly?

2. **WSS support:** The code mentions `ws://` for localhost. Does the system support `wss://` for remote deployment? What's the handshake validation?

3. **Figma API versioning:** The manifest specifies `"api": "1.0.0"`. Are there breaking changes between Figma API versions? How does the plugin handle version mismatches?

4. **Multi-document support:** Can the plugin handle multiple Figma files/documents simultaneously? How are channels scoped to documents?

5. **Rate limiting:** Are there Figma API rate limits? Does the plugin implement backoff or queuing for bulk operations?

6. **Batch operation chunking:** What determines the optimal chunk size for `set_multiple_text_contents` and similar batch tools? Is it configurable?

7. **Component override inheritance:** When setting instance overrides, are nested component overrides supported? How deep can override chains go?

8. **Export formats:** The `export_node_as_image` tool—what formats are supported? PNG, SVG, PDF? File size limits?

9. **Docker deployment:** The Dockerfile exists but wasn't analyzed. What's the intended runtime environment?

10. **Test coverage:** Is there a test suite? How is the MCP server unit tested without a live Figma instance?

---

## SOURCES & REFERENCES

- [GitHub Repository](https://github.com/grab/cursor-talk-to-figma-mcp)
- [Model Context Protocol TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/)
- [Figma Plugin Manifest Documentation](https://developers.figma.com/docs/plugins/manifest/)
- [Figma Plugin API Reference](https://www.figma.com/plugin-docs/api/figma/)
- [@modelcontextprotocol/sdk npm Package](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Figma Plugin WebSocket Example](https://github.com/mattdesl/figma-plugin-websockets)
- [Best Practices: WebSocket Plugin Communication](https://developers.figma.com/docs/plugins/making-network-requests/)

---

## SUMMARY FOR IMPLEMENTATION PLANNING

**Architecture:** 3-tier separation (MCP Server ← WebSocket Relay → Figma Plugin)

**Tech Stack:** Bun + TypeScript + @modelcontextprotocol/sdk v1.13.1 + ws (WebSocket) + Zod validation

**Message Protocol:** JSON over WebSocket with channel-based routing, UUID correlation, no-echo broadcast

**Plugin Constraints:** dynamic-page document access, no special permissions, localhost:3055 network whitelist

**Tool Pattern:** Zod-validated parameters, async handlers, text/error return format

**Critical Details:**
- Colors in [0, 1] RGBA range
- 30s timeout with progress-update reset
- Figma API calls in plugin code.js via try-catch
- All logs to stderr (stdout reserved for MCP protocol)

**Build:** tsup outputs to dist/server.js (CJS + ESM), bun socket runs relay, setup.sh configures IDE integration

