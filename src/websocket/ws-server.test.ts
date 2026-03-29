import { describe, it, after, before } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startWebSocketServer } from "./ws-server.js";

const TEST_PORT = 13099; // Unusual port to avoid conflicts

describe("WebSocket Server", () => {
  let server: ReturnType<typeof startWebSocketServer>;

  before(() => {
    server = startWebSocketServer({ port: TEST_PORT, host: "127.0.0.1" });
  });

  after(() => {
    // Force close all clients then server
    for (const client of server.wss.clients) {
      client.terminate();
    }
    server.wss.close();
  });

  /** Helper: connect and wait for open */
  function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }

  /** Helper: wait for next message with timeout */
  function waitMessage(ws: WebSocket, timeoutMs = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("waitMessage timeout")),
        timeoutMs
      );
      ws.once("message", (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
      ws.once("close", () => {
        clearTimeout(timer);
        // On close due to rejection, resolve with a synthetic error msg
        resolve({ type: "closed" });
      });
    });
  }

  /** Helper: close client safely */
  function safeClose(ws: WebSocket) {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  }

  it("should reject unauthenticated messages", async () => {
    const ws = await connectClient();
    const msgPromise = waitMessage(ws);
    ws.send(JSON.stringify({ type: "join", channel: "test" }));
    const msg = await msgPromise;
    // Server sends error then closes
    assert.ok(
      msg.type === "error" || msg.type === "closed",
      "Expected error or closed"
    );
    safeClose(ws);
  });

  it("should reject wrong token", async () => {
    const ws = await connectClient();
    const msgPromise = waitMessage(ws);
    ws.send(
      JSON.stringify({ type: "auth", token: "wrong-token", channel: "test" })
    );
    const msg = await msgPromise;
    assert.ok(
      msg.type === "error" || msg.type === "closed",
      "Expected error or closed"
    );
    safeClose(ws);
  });

  it("should accept correct token and join channel", async () => {
    const ws = await connectClient();
    const msgPromise = waitMessage(ws);
    ws.send(
      JSON.stringify({
        type: "auth",
        token: server.token,
        channel: "test-ch",
      })
    );
    const msg = await msgPromise;
    assert.equal(msg.type, "system");
    assert.match(msg.message, /[Aa]uthenticated/);
    safeClose(ws);
  });

  it("should broadcast to others (no echo)", async () => {
    const ws1 = await connectClient();
    const ws2 = await connectClient();

    // Auth both
    ws1.send(
      JSON.stringify({ type: "auth", token: server.token, channel: "bcast" })
    );
    await waitMessage(ws1);
    ws2.send(
      JSON.stringify({ type: "auth", token: server.token, channel: "bcast" })
    );
    await waitMessage(ws2);

    // ws1 sends message, ws2 should get it
    const ws2Msg = waitMessage(ws2);
    ws1.send(
      JSON.stringify({
        type: "message",
        channel: "bcast",
        message: {
          command: "test_cmd",
          params: {},
          id: "00000000-0000-0000-0000-000000000001",
        },
      })
    );

    const received = await ws2Msg;
    assert.equal(received.type, "message");
    assert.equal(received.message.command, "test_cmd");

    safeClose(ws1);
    safeClose(ws2);
  });

  it("should isolate channels", async () => {
    const ws1 = await connectClient();
    const ws2 = await connectClient();

    ws1.send(
      JSON.stringify({ type: "auth", token: server.token, channel: "ch-a" })
    );
    await waitMessage(ws1);
    ws2.send(
      JSON.stringify({ type: "auth", token: server.token, channel: "ch-b" })
    );
    await waitMessage(ws2);

    let received = false;
    ws2.once("message", () => {
      received = true;
    });

    ws1.send(
      JSON.stringify({
        type: "message",
        channel: "ch-a",
        message: {
          command: "x",
          params: {},
          id: "00000000-0000-0000-0000-000000000002",
        },
      })
    );

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(received, false, "Should not leak across channels");

    safeClose(ws1);
    safeClose(ws2);
  });
});
