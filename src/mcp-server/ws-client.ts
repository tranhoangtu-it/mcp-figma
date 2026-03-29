import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  COMMAND_TIMEOUT_MS,
} from "../shared/constants.js";
import { MessageType } from "../shared/message-schema.js";
import { sanitizeResult } from "../shared/sanitize.js";

/** Pending request tracker */
interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * WebSocket client for MCP server to communicate with Figma plugin
 * via the WebSocket relay server.
 */
export class FigmaWsClient {
  private ws: WebSocket | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly token: string;
  private readonly channel: string;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private connected = false;
  private connecting = false;

  constructor(options: {
    host?: string;
    port?: number;
    token: string;
    channel?: string;
  }) {
    this.host = options.host ?? DEFAULT_WS_HOST;
    this.port = options.port ?? DEFAULT_WS_PORT;
    this.token = options.token;
    this.channel = options.channel ?? "mcp-figma";
  }

  /** Connect to WebSocket relay server */
  async connect(): Promise<void> {
    if (this.connecting || this.connected) {
      throw new Error("Already connected or connecting");
    }
    this.connecting = true;

    return new Promise((resolve, reject) => {
      const url = `ws://${this.host}:${this.port}`;
      console.error(`[mcp-figma] Connecting to WebSocket at ${url}`);

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        // Send auth message
        this.ws!.send(
          JSON.stringify({
            type: MessageType.AUTH,
            token: this.token,
            channel: this.channel,
          })
        );
      });

      this.ws.on("message", (data) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        // Handle auth confirmation
        if (
          msg.type === MessageType.SYSTEM &&
          msg.message === "Authenticated and joined channel"
        ) {
          this.connected = true;
          this.connecting = false;
          console.error(`[mcp-figma] Connected to channel: ${this.channel}`);
          resolve();
          return;
        }

        // Handle auth rejection
        if (msg.type === MessageType.ERROR) {
          console.error(`[mcp-figma] WebSocket error: ${msg.message}`);
          if (!this.connected) {
            this.connecting = false;
            reject(new Error(`Auth failed: ${msg.message}`));
          }
          return;
        }

        // Handle command result from plugin
        if (msg.type === MessageType.MESSAGE && msg.message) {
          const { id, result, error } = msg.message;
          if (id && this.pendingRequests.has(id)) {
            const pending = this.pendingRequests.get(id)!;
            this.pendingRequests.delete(id);
            clearTimeout(pending.timer);
            if (error) {
              pending.reject(new Error(error));
            } else {
              // Sanitize all string values from Figma to prevent injection
              pending.resolve(sanitizeResult(result));
            }
          }
        }

        // Handle progress — reset timeout
        if (msg.type === MessageType.PROGRESS && msg.message) {
          const { id } = msg.message;
          if (id && this.pendingRequests.has(id)) {
            const pending = this.pendingRequests.get(id)!;
            clearTimeout(pending.timer);
            pending.timer = setTimeout(() => {
              this.pendingRequests.delete(id);
              pending.reject(new Error("Command timed out"));
            }, COMMAND_TIMEOUT_MS);
          }
        }
      });

      this.ws.on("close", () => {
        this.connected = false;
        console.error("[mcp-figma] WebSocket disconnected");
        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.reject(new Error("WebSocket disconnected"));
        }
        this.pendingRequests.clear();
      });

      this.ws.on("error", (err) => {
        console.error("[mcp-figma] WebSocket error:", err.message);
        if (!this.connected) {
          reject(err);
        }
      });
    });
  }

  /** Send a command to Figma plugin and await response */
  async sendCommand(
    command: string,
    params: Record<string, unknown> = {},
    timeout = COMMAND_TIMEOUT_MS
  ): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error(
        "Not connected to WebSocket server. Start the WS server and Figma plugin first."
      );
    }

    const id = randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Command '${command}' timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timer });

      this.ws!.send(
        JSON.stringify({
          type: MessageType.MESSAGE,
          channel: this.channel,
          message: { command, params, id },
        })
      );
    });
  }

  /** Check connection status */
  isConnected(): boolean {
    return this.connected;
  }

  /** Disconnect */
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, "MCP server shutting down");
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Client disconnected"));
    }
    this.pendingRequests.clear();
  }
}
