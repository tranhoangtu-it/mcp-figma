import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaWsClient } from "../ws-client.js";
import { execFigmaCommand } from "./tool-helper.js";

/** Register document read tools */
export function registerDocumentTools(
  server: McpServer,
  client: FigmaWsClient
) {
  server.tool(
    "get_document_info",
    "Get Figma document structure: name, pages, current page",
    {},
    async () => execFigmaCommand(client, "get_document_info", {}, true)
  );

  server.tool(
    "get_selection",
    "Get currently selected nodes in Figma",
    {},
    async () => execFigmaCommand(client, "get_selection", {}, true)
  );

  server.tool(
    "get_node_info",
    "Get detailed info about a specific node by ID",
    {
      nodeId: z.string().describe("Figma node ID"),
      depth: z
        .number()
        .min(0)
        .max(10)
        .optional()
        .default(3)
        .describe("Max depth for children traversal (default 3, max 10)"),
    },
    async (params) => execFigmaCommand(client, "get_node_info", params, true)
  );

  server.tool(
    "get_page_nodes",
    "Get all top-level nodes on current or specified page",
    {
      pageId: z.string().optional().describe("Page ID (defaults to current page)"),
      depth: z
        .number()
        .min(0)
        .max(5)
        .optional()
        .default(2)
        .describe("Max depth for children traversal"),
    },
    async (params) => execFigmaCommand(client, "get_page_nodes", params, true)
  );

  server.tool(
    "scan_text_nodes",
    "Find all text nodes under a parent (or current page)",
    {
      parentId: z.string().optional().describe("Parent node ID (defaults to current page)"),
    },
    async (params) => execFigmaCommand(client, "scan_text_nodes", params, true)
  );

  server.tool(
    "scan_nodes_by_type",
    "Find all nodes of specific types (FRAME, TEXT, RECTANGLE, etc.)",
    {
      types: z
        .array(z.string())
        .min(1)
        .describe("Node types to find, e.g. ['FRAME', 'TEXT']"),
      parentId: z.string().optional().describe("Parent node ID (defaults to current page)"),
    },
    async (params) => execFigmaCommand(client, "scan_nodes_by_type", params, true)
  );
}
