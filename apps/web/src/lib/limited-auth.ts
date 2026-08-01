export type LimitedAuthState =
  | "context"
  | "verification"
  | "review"
  | "decision"
  | "confirmation"
  | "receipt"
  | "invalid"
  | "expired";

/**
 * R0-B fixture resolver: maps a token string to one of the mandated
 * `/a/[token]` states (sección 7). No real authorization logic runs — that
 * lands in R0-D. Never echoes the token back into the page.
 */
export function resolveLimitedAuthState(token: string): LimitedAuthState {
  const known: Record<string, LimitedAuthState> = {
    "demo-token": "context",
    "demo-token-verification": "verification",
    "demo-token-review": "review",
    "demo-token-decision": "decision",
    "demo-token-confirmation": "confirmation",
    "demo-token-receipt": "receipt",
    "demo-token-expired": "expired",
  };
  return known[token] ?? "invalid";
}
