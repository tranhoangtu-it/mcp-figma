/** Default WebSocket server port */
export const DEFAULT_WS_PORT = 3055;

/** Default WebSocket host — localhost only for security */
export const DEFAULT_WS_HOST = "127.0.0.1";

/** Auth token length in bytes (generates 64-char hex string) */
export const AUTH_TOKEN_BYTES = 32;

/** WebSocket heartbeat interval in ms */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Command timeout in ms (reset on progress updates) */
export const COMMAND_TIMEOUT_MS = 30_000;

/** Max WebSocket message size in bytes (10MB for image exports) */
export const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

/** Max connections per server */
export const MAX_CONNECTIONS = 5;

/** Rate limit: max messages per second per client */
export const RATE_LIMIT_PER_SECOND = 100;

/** MCP server metadata */
export const MCP_SERVER_NAME = "mcp-figma";
export const MCP_SERVER_VERSION = "0.1.0";
