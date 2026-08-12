import { z } from "zod";
import { SanitizedError } from "./errors";

export const MAX_TITLE = 120;
export const MAX_GOAL = 4000;
export const MAX_BRANCH = 200;
export const MAX_ID = 80;

const strictBool = z.boolean({
  required_error: "boolean required",
  invalid_type_error: "boolean required (loose coercion rejected)",
});

export const createJobSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE),
  goal: z.string().trim().min(1).max(MAX_GOAL),
  requestedBranch: z.string().trim().min(1).max(MAX_BRANCH).optional(),
  startingRef: z.string().trim().min(1).max(MAX_BRANCH).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).optional(),
  forcePaid: strictBool.optional(),
  forceDestructive: strictBool.optional(),
  run: strictBool.optional(),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

export const killSwitchSchema = z.object({
  enabled: strictBool,
});

export const autopilotSchema = z.object({
  state: z.enum(["running", "paused"]),
});

export const loginSchema = z.object({
  password: z.string().min(1).max(512),
});

export const idSchema = z.string().trim().min(1).max(MAX_ID);

export function parseOrThrow<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new SanitizedError({
      message: result.error.issues.map((i) => i.message).join("; "),
      category: "validation",
      statusCode: 400,
    });
  }
  return result.data;
}

export function assertBodySize(contentLength: string | null, maxBytes: number): void {
  if (!contentLength) return;
  const n = Number(contentLength);
  if (Number.isFinite(n) && n > maxBytes) {
    throw new SanitizedError({
      message: `Request body exceeds ${maxBytes} bytes`,
      category: "validation",
      statusCode: 413,
    });
  }
}
