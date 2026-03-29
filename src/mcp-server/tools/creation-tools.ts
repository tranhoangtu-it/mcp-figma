import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaWsClient } from "../ws-client.js";
import { figmaColorSchema } from "../../shared/message-schema.js";
import { execFigmaCommand } from "./tool-helper.js";

/** Register node creation tools */
export function registerCreationTools(
  server: McpServer,
  client: FigmaWsClient
) {
  server.tool(
    "create_frame",
    "Create a new frame in Figma with position, size, optional fill and auto-layout",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().min(1).describe("Width in pixels"),
      height: z.number().min(1).describe("Height in pixels"),
      name: z.string().optional().describe("Frame name"),
      fillColor: figmaColorSchema.optional().describe("Fill color (RGBA 0-1)"),
      parentId: z.string().optional().describe("Parent node ID"),
      layoutMode: z
        .enum(["NONE", "HORIZONTAL", "VERTICAL"])
        .optional()
        .describe("Auto-layout direction"),
      itemSpacing: z.number().min(0).optional().describe("Spacing between items"),
      padding: z.number().min(0).optional().describe("Uniform padding"),
    },
    async (params) => execFigmaCommand(client, "create_frame", params, true)
  );

  server.tool(
    "create_rectangle",
    "Create a rectangle with position, size, optional fill and corner radius",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().min(1).describe("Width"),
      height: z.number().min(1).describe("Height"),
      name: z.string().optional().describe("Rectangle name"),
      fillColor: figmaColorSchema.optional().describe("Fill color (RGBA 0-1)"),
      cornerRadius: z.number().min(0).optional().describe("Corner radius"),
      parentId: z.string().optional().describe("Parent node ID"),
    },
    async (params) => execFigmaCommand(client, "create_rectangle", params, true)
  );

  server.tool(
    "create_text",
    "Create a text node. Uses Inter font by default. Figma must have the font available.",
    {
      text: z.string().describe("Text content"),
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      fontSize: z.number().min(1).optional().default(14).describe("Font size"),
      fontFamily: z.string().optional().default("Inter").describe("Font family"),
      fontStyle: z.string().optional().default("Regular").describe("Font style"),
      name: z.string().optional().describe("Text node name"),
      fillColor: figmaColorSchema.optional().describe("Text color (RGBA 0-1)"),
      textAlignHorizontal: z
        .enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"])
        .optional()
        .describe("Horizontal text alignment"),
      parentId: z.string().optional().describe("Parent node ID"),
    },
    async (params) => execFigmaCommand(client, "create_text", params, true)
  );

  server.tool(
    "create_ellipse",
    "Create an ellipse (circle if width equals height)",
    {
      x: z.number().describe("X position"),
      y: z.number().describe("Y position"),
      width: z.number().min(1).describe("Width"),
      height: z.number().min(1).describe("Height"),
      name: z.string().optional().describe("Ellipse name"),
      fillColor: figmaColorSchema.optional().describe("Fill color (RGBA 0-1)"),
      parentId: z.string().optional().describe("Parent node ID"),
    },
    async (params) => execFigmaCommand(client, "create_ellipse", params, true)
  );
}
