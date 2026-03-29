# Phase 1: Project Setup & Scaffolding

## Overview
- **Priority:** P0
- **Status:** completed
- **Effort:** Small
- **Description:** Initialize Node.js/TypeScript project with MCP SDK, configure build tools, establish project structure.

## Key Insights
- Grab uses Bun + tsup; we use Node.js + tsup for broader compatibility
- MCP SDK v1.13.1 is latest stable
- Dual output (CJS + ESM) for maximum compatibility

## Architecture

```
mcp-figma/
├── src/
│   ├── mcp-server/
│   │   ├── index.ts              # MCP server entry point
│   │   └── tools/                # MCP tool definitions (modular)
│   ├── websocket/
│   │   ├── ws-server.ts          # WebSocket relay server
│   │   └── ws-auth.ts            # Token authentication
│   ├── figma-plugin/
│   │   ├── manifest.json         # Figma plugin config
│   │   ├── code.ts               # Plugin command dispatcher
│   │   └── ui.html               # Plugin UI + WS connection
│   └── shared/
│       ├── message-schema.ts     # Shared message types + Zod schemas
│       └── constants.ts          # Ports, defaults, config
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── .gitignore
└── README.md
```

## Related Code Files
- Create: all files above
- Reference: Grab's `package.json`, `tsup.config.ts` for patterns

## Implementation Steps

1. `npm init` with project metadata (name: `mcp-figma`, type: `module`)
2. Install dependencies:
   - `@modelcontextprotocol/sdk` ^1.13.1
   - `ws` (WebSocket library)
   - `zod` ^3.22.4
   - `uuid`
3. Install devDependencies:
   - `typescript` ^5.0
   - `tsup` ^8.4
   - `@types/ws`
   - `@types/uuid`
4. Create `tsconfig.json` (target: ES2022, module: ESNext, strict: true)
5. Create `tsup.config.ts` (entry: `src/mcp-server/index.ts` + `src/websocket/ws-server.ts`)
6. Create directory structure
7. Create placeholder files with minimal exports
8. Create `.gitignore` (node_modules, dist, .env)
9. Verify build: `npx tsup` compiles without errors

## Todo List
- [x] npm init + install deps
- [x] tsconfig.json + tsup.config.ts
- [x] Create directory structure
- [x] Placeholder files
- [x] Verify build compiles

## Success Criteria
- `npm run build` completes without errors
- Project structure matches architecture above
- All dependencies installed and resolvable

## Risk Assessment
- **Low risk** — standard project scaffolding
- Ensure MCP SDK version compatibility with Node.js LTS
