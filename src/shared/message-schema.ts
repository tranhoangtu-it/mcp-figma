import { z } from "zod";

/** WebSocket message types */
export const MessageType = {
  AUTH: "auth",
  JOIN: "join",
  MESSAGE: "message",
  PROGRESS: "progress",
  SYSTEM: "system",
  ERROR: "error",
} as const;

/** Auth message — first message client must send */
export const authMessageSchema = z.object({
  type: z.literal(MessageType.AUTH),
  token: z.string().min(1),
  channel: z.string().min(1),
});

/** Join channel message */
export const joinMessageSchema = z.object({
  type: z.literal(MessageType.JOIN),
  channel: z.string().min(1),
});

/** Command payload sent from MCP server to plugin */
export const commandPayloadSchema = z.object({
  command: z.string().min(1),
  params: z.record(z.unknown()).optional().default({}),
  id: z.string().min(1),
});

/** Result payload sent from plugin back to MCP server */
export const resultPayloadSchema = z.object({
  result: z.unknown(),
  id: z.string().min(1),
  error: z.string().optional(),
});

/** Progress payload from plugin during long operations */
export const progressPayloadSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["in_progress", "completed", "error"]),
  percentage: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  result: z.unknown().optional(),
});

/** Generic message envelope for channel communication */
export const channelMessageSchema = z.object({
  type: z.literal(MessageType.MESSAGE),
  channel: z.string().min(1),
  message: z.union([commandPayloadSchema, resultPayloadSchema]),
  id: z.string().optional(),
});

/** Progress message envelope */
export const progressMessageSchema = z.object({
  type: z.literal(MessageType.PROGRESS),
  channel: z.string().min(1),
  message: progressPayloadSchema,
});

/** System/error message */
export const systemMessageSchema = z.object({
  type: z.enum([MessageType.SYSTEM, MessageType.ERROR]),
  channel: z.string().optional(),
  message: z.string(),
});

/** Any valid incoming WebSocket message */
export const incomingMessageSchema = z.discriminatedUnion("type", [
  authMessageSchema,
  joinMessageSchema,
  channelMessageSchema,
  progressMessageSchema,
]);

/** RGBA color in Figma's 0-1 range */
export const figmaColorSchema = z.object({
  r: z.number().min(0).max(1).describe("Red (0-1)"),
  g: z.number().min(0).max(1).describe("Green (0-1)"),
  b: z.number().min(0).max(1).describe("Blue (0-1)"),
  a: z.number().min(0).max(1).optional().default(1).describe("Alpha (0-1)"),
});

/** Inferred types */
export type AuthMessage = z.infer<typeof authMessageSchema>;
export type JoinMessage = z.infer<typeof joinMessageSchema>;
export type ChannelMessage = z.infer<typeof channelMessageSchema>;
export type ProgressMessage = z.infer<typeof progressMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;
export type IncomingMessage = z.infer<typeof incomingMessageSchema>;
export type CommandPayload = z.infer<typeof commandPayloadSchema>;
export type ResultPayload = z.infer<typeof resultPayloadSchema>;
export type ProgressPayload = z.infer<typeof progressPayloadSchema>;
export type FigmaColor = z.infer<typeof figmaColorSchema>;
