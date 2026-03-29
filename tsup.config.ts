import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "mcp-server/index": "src/mcp-server/index.ts",
    "websocket/ws-server": "src/websocket/ws-server.ts",
  },
  format: ["esm"],
  target: "node18",
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: true,
  banner: {
    // Shebang for MCP server entry point
    js: "#!/usr/bin/env node",
  },
});
