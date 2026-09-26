type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; items?: Schema; enum?: unknown[]; minimum?: number; maximum?: number };
type Tool = { function: { name: string; parameters: Schema } };

/** Validate the small JSON-schema subset used by our tools before executing.
 * Invalid calls become tool errors the model can correct, never route crashes.
 */
export function validateToolCall(tools: unknown[], name: unknown, raw: unknown):
  { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  const tool = (tools as Tool[]).find((t) => t.function?.name === name);
  if (!tool) return { ok: false, error: "Error: that tool is not available. Use an available tool or load_tools first." };
  let args = raw ?? {};
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch { return { ok: false, error: "Error: tool arguments must be a JSON object." }; }
  }
  const check = (value: unknown, schema: Schema, path: string): string | null => {
    if (schema.enum && !schema.enum.includes(value)) return `${path} must be one of ${schema.enum.join(", ")}`;
    if (schema.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return `${path} must be an object`;
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (record[key] === undefined || record[key] === null || typeof record[key] === "string" && !record[key].trim()) return `${path}.${key} is required`;
      for (const [key, v] of Object.entries(record)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) return `${path}.${key} is not a supported argument`;
        if (!(schema.required ?? []).includes(key) && (v === null || v === "")) { delete record[key]; continue; }
        const error = check(v, schema.properties![key], `${path}.${key}`);
        if (error) return error;
      }
    } else if (schema.type === "array") {
      if (!Array.isArray(value) || value.length > 150) return `${path} must be an array with at most 150 entries`;
      for (const item of value) { const error = check(item, schema.items ?? {}, path); if (error) return error; }
    } else if (schema.type === "string") {
      if (typeof value !== "string" || !value.trim() || value.length > 50_000) return `${path} must be a nonempty string of at most 50,000 characters`;
    } else if (schema.type === "number" || schema.type === "integer") {
      if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) return `${path} must be a finite ${schema.type}`;
      if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) return `${path} is outside its allowed range`;
    } else if (schema.type === "boolean" && typeof value !== "boolean") return `${path} must be a boolean`;
    return null;
  };
  const error = check(args, tool.function.parameters, "arguments");
  return error ? { ok: false, error: `Error: ${error}. Correct the arguments before retrying.` } : { ok: true, args: args as Record<string, unknown> };
}
