import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaWsClient } from "../ws-client.js";
import { execFigmaCommand } from "./tool-helper.js";

/** Register export tools */
export function registerExportTools(
  server: McpServer,
  client: FigmaWsClient
) {
  server.tool(
    "export_node",
    "Export a node as PNG, SVG, or PDF. Returns base64-encoded image data.",
    {
      nodeId: z.string().describe("Node ID to export"),
      format: z
        .enum(["PNG", "SVG", "PDF"])
        .optional()
        .default("PNG")
        .describe("Export format"),
      scale: z
        .number()
        .min(0.1)
        .max(4)
        .optional()
        .default(1)
        .describe("Scale factor (PNG/PDF only, 0.1-4)"),
    },
    async (params) => execFigmaCommand(client, "export_node", params)
  );
}
