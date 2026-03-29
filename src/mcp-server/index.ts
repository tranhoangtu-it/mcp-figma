import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  DEFAULT_WS_PORT,
} from "../shared/constants.js";
import { FigmaWsClient } from "./ws-client.js";
import { registerDocumentTools } from "./tools/document-tools.js";
import { registerCreationTools } from "./tools/creation-tools.js";
import { registerModificationTools } from "./tools/modification-tools.js";
import { registerStyleTools } from "./tools/style-tools.js";
import { registerExportTools } from "./tools/export-tools.js";

async function main() {
  // Read config from environment
  const token = process.env.MCP_FIGMA_TOKEN;
  const port = parseInt(
    process.env.MCP_FIGMA_PORT || String(DEFAULT_WS_PORT)
  );
  const channel = process.env.MCP_FIGMA_CHANNEL || "mcp-figma";

  if (!token) {
    console.error(
      "[mcp-figma] ERROR: MCP_FIGMA_TOKEN env var required.\n" +
        "Start the WebSocket server first (npm run ws) and copy the session token."
    );
    process.exit(1);
  }

  // Create WebSocket client
  const wsClient = new FigmaWsClient({ port, token, channel });

  // Connect to WebSocket relay
  try {
    await wsClient.connect();
  } catch (err: any) {
    console.error(
      `[mcp-figma] Failed to connect to WebSocket server: ${err.message}\n` +
        "Make sure the WebSocket server is running (npm run ws) " +
        "and the token is correct."
    );
    process.exit(1);
  }

  // Create MCP server
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  // Register all tool modules
  registerDocumentTools(server, wsClient);
  registerCreationTools(server, wsClient);
  registerModificationTools(server, wsClient);
  registerStyleTools(server, wsClient);
  registerExportTools(server, wsClient);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.error("[mcp-figma] Shutting down...");
    wsClient.disconnect();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    wsClient.disconnect();
    process.exit(0);
  });

  // Start MCP server via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[mcp-figma] MCP server started — ${MCP_SERVER_NAME} v${MCP_SERVER_VERSION}`
  );
  console.error(`[mcp-figma] 25 tools registered, connected to WS on port ${port}`);
}

main().catch((err) => {
  console.error("[mcp-figma] Fatal error:", err);
  process.exit(1);
});
