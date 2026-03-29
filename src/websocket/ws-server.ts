import { WebSocketServer, WebSocket } from "ws";
import {
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  MAX_MESSAGE_SIZE,
  MAX_CONNECTIONS,
  HEARTBEAT_INTERVAL_MS,
  RATE_LIMIT_PER_SECOND,
} from "../shared/constants.js";
import { incomingMessageSchema, MessageType } from "../shared/message-schema.js";
import { generateToken, AuthManager } from "./ws-auth.js";

/** Track per-client state */
interface ClientState {
  alive: boolean;
  channel: string | null;
  messageTimestamps: number[];
}

/** Channel map: channel name → set of clients */
const channels = new Map<string, Set<WebSocket>>();

/** Per-client state */
const clientStates = new Map<WebSocket, ClientState>();

/** Check if client exceeds rate limit */
function isRateLimited(state: ClientState): boolean {
  const now = Date.now();
  // Remove timestamps older than 1 second
  state.messageTimestamps = state.messageTimestamps.filter(
    (t) => now - t < 1000
  );
  if (state.messageTimestamps.length >= RATE_LIMIT_PER_SECOND) {
    return true;
  }
  state.messageTimestamps.push(now);
  return false;
}

/** Remove client from all channels and cleanup state */
function removeClient(ws: WebSocket) {
  const state = clientStates.get(ws);
  if (state?.channel) {
    const channelClients = channels.get(state.channel);
    if (channelClients) {
      channelClients.delete(ws);
      if (channelClients.size === 0) {
        channels.delete(state.channel);
      }
    }
  }
  clientStates.delete(ws);
}

/** Broadcast message to all OTHER clients in channel (no echo) */
function broadcastToChannel(
  channel: string,
  message: string,
  sender: WebSocket
) {
  const channelClients = channels.get(channel);
  if (!channelClients) return;
  for (const client of channelClients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/** Send error and close connection */
function rejectConnection(ws: WebSocket, reason: string) {
  ws.send(
    JSON.stringify({
      type: MessageType.ERROR,
      message: reason,
    })
  );
  ws.close(4001, reason);
}

/** Start the WebSocket relay server */
export function startWebSocketServer(options?: {
  port?: number;
  host?: string;
}) {
  const port = options?.port ?? parseInt(process.env.MCP_FIGMA_PORT || String(DEFAULT_WS_PORT));
  const host = options?.host ?? DEFAULT_WS_HOST;
  const token = generateToken();
  const auth = new AuthManager(token);

  const wss = new WebSocketServer({
    port,
    host,
    maxPayload: MAX_MESSAGE_SIZE,
  });

  // Heartbeat interval — detect dead connections
  const heartbeatInterval = setInterval(() => {
    for (const ws of wss.clients) {
      const state = clientStates.get(ws);
      if (!state || !state.alive) {
        ws.terminate();
        removeClient(ws);
        continue;
      }
      state.alive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("connection", (ws, req) => {
    // Enforce max connections
    if (wss.clients.size > MAX_CONNECTIONS) {
      rejectConnection(ws, "Max connections exceeded");
      return;
    }

    // Verify connection comes from localhost
    const remoteAddr = req.socket.remoteAddress;
    if (remoteAddr !== "127.0.0.1" && remoteAddr !== "::1" && remoteAddr !== "::ffff:127.0.0.1") {
      rejectConnection(ws, "Only localhost connections allowed");
      return;
    }

    const state: ClientState = {
      alive: true,
      channel: null,
      messageTimestamps: [],
    };
    clientStates.set(ws, state);

    ws.on("pong", () => {
      const s = clientStates.get(ws);
      if (s) s.alive = true;
    });

    ws.on("message", (data) => {
      const s = clientStates.get(ws);
      if (!s) return;

      // Rate limiting
      if (isRateLimited(s)) {
        ws.send(
          JSON.stringify({
            type: MessageType.ERROR,
            message: "Rate limit exceeded",
          })
        );
        return;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        ws.send(
          JSON.stringify({
            type: MessageType.ERROR,
            message: "Invalid JSON",
          })
        );
        return;
      }

      // First message MUST be auth
      if (!auth.isAuthenticated(ws)) {
        const parsed = incomingMessageSchema.safeParse(raw);
        if (!parsed.success || parsed.data.type !== MessageType.AUTH) {
          rejectConnection(ws, "First message must be auth");
          return;
        }
        if (!auth.authenticate(ws, parsed.data.token)) {
          rejectConnection(ws, "Invalid token");
          return;
        }
        // Auth successful — auto-join channel
        const channel = parsed.data.channel;
        s.channel = channel;
        if (!channels.has(channel)) {
          channels.set(channel, new Set());
        }
        channels.get(channel)!.add(ws);

        ws.send(
          JSON.stringify({
            type: MessageType.SYSTEM,
            channel,
            message: "Authenticated and joined channel",
          })
        );
        console.error(`[ws] Client authenticated and joined channel: ${channel}`);
        return;
      }

      // Validate message schema
      const parsed = incomingMessageSchema.safeParse(raw);
      if (!parsed.success) {
        ws.send(
          JSON.stringify({
            type: MessageType.ERROR,
            message: `Invalid message: ${parsed.error.message}`,
          })
        );
        return;
      }

      const msg = parsed.data;

      switch (msg.type) {
        case MessageType.JOIN: {
          // Switch channel
          if (s.channel) {
            const old = channels.get(s.channel);
            if (old) {
              old.delete(ws);
              if (old.size === 0) channels.delete(s.channel);
            }
          }
          s.channel = msg.channel;
          if (!channels.has(msg.channel)) {
            channels.set(msg.channel, new Set());
          }
          channels.get(msg.channel)!.add(ws);
          ws.send(
            JSON.stringify({
              type: MessageType.SYSTEM,
              channel: msg.channel,
              message: "Joined channel",
            })
          );
          break;
        }

        case MessageType.MESSAGE: {
          // Verify sender belongs to target channel
          if (s.channel !== msg.channel) {
            ws.send(JSON.stringify({ type: MessageType.ERROR, message: "Not a member of channel: " + msg.channel }));
            break;
          }
          broadcastToChannel(msg.channel, JSON.stringify(msg), ws);
          break;
        }

        case MessageType.PROGRESS: {
          if (s.channel !== msg.channel) {
            ws.send(JSON.stringify({ type: MessageType.ERROR, message: "Not a member of channel: " + msg.channel }));
            break;
          }
          broadcastToChannel(msg.channel, JSON.stringify(msg), ws);
          break;
        }

        default:
          break;
      }
    });

    ws.on("close", () => {
      removeClient(ws);
      console.error(`[ws] Client disconnected`);
    });

    ws.on("error", (err) => {
      console.error(`[ws] Client error:`, err.message);
      removeClient(ws);
    });
  });

  wss.on("listening", () => {
    console.error(`[ws] WebSocket server listening on ${host}:${port}`);
    console.error(`[ws] Session token: ${token}`);
    console.error(`[ws] Use this token in the Figma plugin to connect`);
  });

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
    channels.clear();
    clientStates.clear();
  });

  return { wss, token, auth };
}

// Run directly if this is the entry point (not when imported by tests)
const entryFile = process.argv[1] ?? "";
const isMain =
  entryFile.endsWith("ws-server.js") ||
  (entryFile.endsWith("ws-server.ts") && !entryFile.includes(".test."));
if (isMain) {
  startWebSocketServer();
}
