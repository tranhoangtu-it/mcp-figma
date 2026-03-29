import { randomBytes, timingSafeEqual } from "node:crypto";
import { AUTH_TOKEN_BYTES } from "../shared/constants.js";

/** Generate a cryptographically random session token */
export function generateToken(): string {
  return randomBytes(AUTH_TOKEN_BYTES).toString("hex");
}

/**
 * Manages WebSocket authentication state.
 * Each connection must send a valid auth message as its first message.
 */
export class AuthManager {
  private readonly token: string;
  private readonly authenticatedClients = new WeakSet<object>();

  constructor(token: string) {
    this.token = token;
  }

  /** Validate token and mark client as authenticated (timing-safe) */
  authenticate(client: object, token: string): boolean {
    const expected = Buffer.from(this.token, "utf8");
    const received = Buffer.from(token, "utf8");
    // Constant-time comparison to prevent timing side-channel attacks
    if (
      expected.length === received.length &&
      timingSafeEqual(expected, received)
    ) {
      this.authenticatedClients.add(client);
      return true;
    }
    return false;
  }

  /** Check if client has been authenticated */
  isAuthenticated(client: object): boolean {
    return this.authenticatedClients.has(client);
  }

  /** Get the session token (for display/sharing) */
  getToken(): string {
    return this.token;
  }
}
