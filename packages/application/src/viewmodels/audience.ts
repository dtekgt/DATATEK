// Audience projection contracts — DATATEK_R0_C sección 5.5.
//
// R0-C has no real business entities yet (clientes, casos, vehículos ship in
// R0-D). This module is the typed contract for "a ViewModel is an
// authorized projection, not a permission": it fixes the shape of the cache
// key and the three audiences so R0-D's real projections plug into an
// already-reviewed boundary instead of inventing one under deadline
// pressure.

/** Every projection is built for exactly one audience. Pass and guest never
 * receive the same fields as Pro. */
export type ProjectionAudience = "pro" | "pass" | "guest";

/** Cache keys always separate audience, tenant and scope — Control and
 * customer-facing surfaces never share a cache entry (sección 5.5). */
export interface AudienceCacheKey {
  audience: ProjectionAudience;
  organizationId: string;
  /** A stable scope discriminator: branch id, case id, guest token id — the
   * narrowest thing the projection was computed for. */
  scope: string;
}

export function buildAudienceCacheKey(key: AudienceCacheKey): string {
  return `${key.audience}:${key.organizationId}:${key.scope}`;
}

/** A customer-visible fact never carries internal-only detail (respaldo
 * interno, notas de taller, costos). It's the same "fact" shape that Pro
 * uses, minus everything that isn't `visibility: "customer"` or
 * `"shared_case"` upstream. */
export interface CustomerVisibleFact {
  label: string;
  detail: string | null;
  observedAt: string | null;
}

/** The minimum data a Pass session may see about a case: audience-scoped,
 * never a full case entity. Distinct from `PassHomeViewModel` in
 * `viewmodels/pass.ts` (R0-B's fixture-driven home screen contract) — this
 * type is the audience-envelope contract R0-D's real adapter narrows into. */
export interface PassAudienceViewModel {
  audience: "pass";
  customerDisplayName: string;
  facts: CustomerVisibleFact[];
}

/** A guest (limited-authorization) token never gets a Pass session. It's
 * capped to one case, one audience, one version and its own scoped actions —
 * it cannot enumerate other cases or vehicles (sección 5.6). */
export interface GuestScopedViewModel {
  audience: "guest";
  caseId: string;
  quoteVersionId: string;
  facts: CustomerVisibleFact[];
  /** Only the actions this exact token was scoped to; never widened by
   * combining with any other permission. */
  allowedActions: string[];
}

/** Internal Pro view of the same case-proof summary. Never returned to a
 * customer or guest audience — deliberately a distinct type so a mistaken
 * `as` cast is the only way to leak it. */
export interface CaseProofSummaryInternal {
  audience: "pro";
  caseId: string;
  internalNotes: string[];
  evidenceCount: number;
  facts: CustomerVisibleFact[];
}

/** Customer-facing case-proof summary — the projection actually sent to
 * Pass/guest. No internal notes, no raw counts beyond what's customer
 * relevant. */
export interface CaseProofSummaryCustomer {
  audience: "pass" | "guest";
  caseId: string;
  facts: CustomerVisibleFact[];
}

/** Minimizes an actor label for a customer-facing audience: first name +
 * role only, never full name + internal identifiers (sección 5.5: "la
 * etiqueta del actor se minimiza según audiencia"). */
export function minimizeActorLabelForCustomer(fullName: string, role: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? fullName;
  return `${firstName} · ${role}`;
}

/** Projects the internal summary down to what a customer/guest may see.
 * This is the one place allowed to narrow `CaseProofSummaryInternal` into
 * `CaseProofSummaryCustomer` — R0-D's real adapter calls this instead of
 * hand-rolling the field list at each call site. */
export function projectCaseProofSummaryForCustomer(
  internal: CaseProofSummaryInternal,
): CaseProofSummaryCustomer {
  return {
    audience: "pass",
    caseId: internal.caseId,
    facts: internal.facts,
  };
}
