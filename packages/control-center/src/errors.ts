export type ErrorCategory =
  | "validation"
  | "auth"
  | "rate_limit"
  | "kill_switch"
  | "branch_policy"
  | "approval"
  | "director"
  | "cursor"
  | "recovery"
  | "config"
  | "internal";

export class SanitizedError extends Error {
  readonly category: ErrorCategory;
  readonly statusCode: number;
  readonly provider?: string;
  readonly correlationId: string;
  readonly retryable: boolean;

  constructor(input: {
    message: string;
    category: ErrorCategory;
    statusCode?: number;
    provider?: string;
    correlationId?: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "SanitizedError";
    this.category = input.category;
    this.statusCode = input.statusCode ?? 400;
    this.provider = input.provider;
    this.correlationId = input.correlationId || `cc_${Date.now().toString(16)}`;
    this.retryable = Boolean(input.retryable);
  }

  toJSON() {
    return {
      error: this.message,
      category: this.category,
      statusCode: this.statusCode,
      provider: this.provider,
      correlationId: this.correlationId,
      retryable: this.retryable,
    };
  }
}

export function sanitizeVendorFailure(
  provider: "openai" | "cursor",
  status: number,
  _rawBody: string,
  fallbackMessage: string,
): SanitizedError {
  void _rawBody; // intentionally unused — never forward vendor bodies
  const category: ErrorCategory = provider === "openai" ? "director" : "cursor";
  const retryable = status >= 500 || status === 429;
  return new SanitizedError({
    message: fallbackMessage,
    category,
    statusCode: status >= 400 && status < 600 ? status : 502,
    provider,
    retryable,
  });
}

export function assertNoSecretsInText(text: string): void {
  const patterns = [
    /sk-[a-zA-Z0-9]{10,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /Bearer\s+[A-Za-z0-9._\-+/=]{20,}/i,
  ];
  for (const p of patterns) {
    if (p.test(text)) {
      throw new Error("Refusing to expose secret-like content");
    }
  }
}
