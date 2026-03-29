import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FigmaWsClient } from "../ws-client.js";
import { execFigmaCommand } from "./tool-helper.js";

/** Register node modification tools */
export function registerModificationTools(
  server: McpServer,
  client: FigmaWsClient
) {
  server.tool("move_node", "Move a node to new X/Y coordinates", {
    nodeId: z.string().describe("Node ID to move"),
    x: z.number().describe("New X position"),
    y: z.number().describe("New Y position"),
  }, async (params) => execFigmaCommand(client, "move_node", params));

  server.tool("resize_node", "Resize a node to new width and height", {
    nodeId: z.string().describe("Node ID to resize"),
    width: z.number().min(1).describe("New width"),
    height: z.number().min(1).describe("New height"),
  }, async (params) => execFigmaCommand(client, "resize_node", params));

  server.tool("set_name", "Rename a node", {
    nodeId: z.string().describe("Node ID"),
    name: z.string().describe("New name"),
  }, async (params) => execFigmaCommand(client, "set_name", params));

  server.tool("set_corner_radius", "Set corner radius on a node (rectangle, frame)", {
    nodeId: z.string().describe("Node ID"),
    radius: z.number().min(0).describe("Corner radius in pixels"),
  }, async (params) => execFigmaCommand(client, "set_corner_radius", params));

  server.tool("delete_node", "Delete a node from the canvas", {
    nodeId: z.string().describe("Node ID to delete"),
  }, async (params) => execFigmaCommand(client, "delete_node", params));

  server.tool("clone_node", "Duplicate a node, optionally into a different parent", {
    nodeId: z.string().describe("Node ID to clone"),
    parentId: z.string().optional().describe("Parent node ID for the clone"),
  }, async (params) => execFigmaCommand(client, "clone_node", params, true));

  server.tool("group_nodes", "Group multiple nodes together", {
    nodeIds: z.array(z.string()).min(2).describe("Node IDs to group (minimum 2)"),
    name: z.string().optional().describe("Group name"),
  }, async (params) => execFigmaCommand(client, "group_nodes", params, true));

  server.tool("set_auto_layout", "Configure auto-layout on a frame", {
    nodeId: z.string().describe("Frame node ID"),
    mode: z.enum(["NONE", "HORIZONTAL", "VERTICAL"]).describe("Layout direction"),
    spacing: z.number().min(0).optional().describe("Item spacing"),
    padding: z.number().min(0).optional().describe("Uniform padding"),
    primaryAxisAlignItems: z.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]).optional().describe("Main axis alignment"),
    counterAxisAlignItems: z.enum(["MIN", "CENTER", "MAX"]).optional().describe("Cross axis alignment"),
  }, async (params) => execFigmaCommand(client, "set_auto_layout", params, true));
}
