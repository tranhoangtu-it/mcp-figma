import type { FigmaWsClient } from "../ws-client.js";

/** Wraps a sendCommand call with error handling for MCP tool callbacks */
export async function execFigmaCommand(
  client: FigmaWsClient,
  command: string,
  params: Record<string, unknown> = {},
  pretty = false
): Promise<Array<{ type: "text"; text: string }>> {
  try {
    const result = await client.sendCommand(command, params);
    const text = pretty
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(result);
    return [{ type: "text", text }];
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return [{ type: "text", text: JSON.stringify({ error: message }) }];
  }
}
