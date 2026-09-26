import { z } from "zod";

const id = z.string().min(1).max(256).refine((s) => !/[\/\\\u0000-\u001f]/.test(s) && s !== "." && s !== "..", "Invalid identifier");
const text = z.string().max(4000);
const document = z.object({
  resourceId: id, name: text, fileType: z.string().max(32), category: text, url: z.string().max(4000),
  vectorIndexed: z.boolean().optional(), indexStatus: z.enum(["queued", "processing", "complete", "failed"]).optional(), ocrScanned: z.boolean().optional(),
});
export const chatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(80_000) })).min(1).max(500),
  context: z.object({
    userId: id, email: z.string().max(512), name: text.optional(), college: text.optional(), timeZone: z.string().max(100).optional(),
    classes: z.array(z.object({
      classId: id, className: text, classCode: text, term: text,
      facultyName: text.optional(), facultyEmail: text.optional(), facultyPhoneNumber: text.optional(), facultyOfficeNumber: text.optional(),
      classSchedule: text.optional(), time: text.optional(), classRoom: text.optional(), classDescription: text.optional(),
      status: z.enum(["active", "planned", "in-progress", "completed"]).transform((s) => s === "active" ? "in-progress" as const : s).optional(), documents: z.array(document).max(1000),
    })).max(100),
  }).nullish().transform((v) => v ?? undefined),
  summary: z.string().max(16_000).optional(), summarizedCount: z.number().int().min(0).optional(),
  currentSessionId: id.nullish().transform((v) => v ?? undefined), panelContextKey: id.optional(), pageContext: z.unknown().optional(),
  modelKey: z.string().max(100).optional(), extraTools: z.boolean().optional(),
  // Confirm cards shown in this conversation (pendingActions.ts), so the chat
  // knows what happened to them - and only them.
  // The side panel's conversations are temporary: don't save them as chat sessions.
  ephemeral: z.boolean().optional(),
  pendingActionIds: z.array(z.string().regex(/^[A-Za-z0-9]{1,64}$/)).max(50).optional(),
}).superRefine((body, ctx) => {
  const last = body.messages.at(-1);
  if (last?.role !== "user" || !last.content.trim() || last.content.length > 4000) {
    ctx.addIssue({ code: "custom", path: ["messages"], message: "End with a nonempty user message of at most 4,000 characters." });
  }
  if ((body.summarizedCount ?? 0) >= body.messages.length) {
    ctx.addIssue({ code: "custom", path: ["summarizedCount"], message: "The latest message cannot be summarized away." });
  }
});
