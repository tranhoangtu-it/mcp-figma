/** Max string length returned from Figma to prevent context overflow */
const MAX_STRING_LENGTH = 10_000;

/**
 * Sanitize a string value from Figma design data.
 * Strips control characters and truncates long strings.
 */
export function sanitizeString(value: string): string {
  // Strip control characters except newline, tab
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (cleaned.length > MAX_STRING_LENGTH) {
    return cleaned.slice(0, MAX_STRING_LENGTH) + "... (truncated)";
  }
  return cleaned;
}

/**
 * Deep sanitize an object — clean all string values recursively.
 * Prevents command injection via design data (node names, text content).
 */
export function sanitizeResult(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeResult);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeResult(v);
    }
    return result;
  }
  return value;
}
