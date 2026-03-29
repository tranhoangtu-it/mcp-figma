import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaWsClient } from "../ws-client.js";
import { execFigmaCommand } from "./tool-helper.js";

/** Register styling tools */
export function registerStyleTools(
  server: McpServer,
  client: FigmaWsClient
) {
  server.tool("set_fill_color", "Set solid fill color on a node. Uses Figma's 0-1 RGBA range.", {
    nodeId: z.string().describe("Node ID"),
    r: z.number().min(0).max(1).describe("Red (0-1)"),
    g: z.number().min(0).max(1).describe("Green (0-1)"),
    b: z.number().min(0).max(1).describe("Blue (0-1)"),
    a: z.number().min(0).max(1).optional().default(1).describe("Alpha (0-1)"),
  }, async (params) => execFigmaCommand(client, "set_fill_color", params));

  server.tool("set_stroke", "Set stroke color and width on a node. Uses Figma's 0-1 RGBA range.", {
    nodeId: z.string().describe("Node ID"),
    r: z.number().min(0).max(1).describe("Red (0-1)"),
    g: z.number().min(0).max(1).describe("Green (0-1)"),
    b: z.number().min(0).max(1).describe("Blue (0-1)"),
    a: z.number().min(0).max(1).optional().default(1).describe("Alpha (0-1)"),
    width: z.number().min(0).optional().default(1).describe("Stroke width"),
  }, async (params) => execFigmaCommand(client, "set_stroke", params));

  server.tool("set_text_content", "Update the text content of an existing text node", {
    nodeId: z.string().describe("Text node ID"),
    text: z.string().describe("New text content"),
  }, async (params) => execFigmaCommand(client, "set_text_content", params));

  server.tool("set_font_size", "Change font size of a text node", {
    nodeId: z.string().describe("Text node ID"),
    fontSize: z.number().min(1).describe("Font size in pixels"),
  }, async (params) => execFigmaCommand(client, "set_font_size", params));

  server.tool("set_opacity", "Set opacity on a node (0 = transparent, 1 = opaque)", {
    nodeId: z.string().describe("Node ID"),
    opacity: z.number().min(0).max(1).describe("Opacity (0-1)"),
  }, async (params) => execFigmaCommand(client, "set_opacity", params));

  server.tool("get_local_styles", "Get all local paint and text styles defined in the document", {},
    async () => execFigmaCommand(client, "get_local_styles", {}, true)
  );
}
