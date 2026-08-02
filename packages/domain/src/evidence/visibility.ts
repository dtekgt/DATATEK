// Evidence visibility — DATATEK_R0_A sección 8.3, literal: "La visibilidad
// efectiva siempre es la más restrictiva. Un link incorrecto no puede
// volver pública una evidencia interna."
import type { Visibility } from "../../generated/spec.constants.ts";

// Lower rank = more restrictive. `internal` must be the strict minimum so
// an asset capped at `internal` can never be exposed by a looser link.
const VISIBILITY_RANK: Record<Visibility, number> = {
  internal: 0,
  shared_case: 1,
  customer: 2,
};

/** The effective visibility of one evidence link is the MORE restrictive of
 * the asset's ceiling (`visibilityMax`, set once at confirm time) and the
 * link's own requested visibility — never looser than either. */
export function effectiveEvidenceVisibility(
  assetVisibilityMax: Visibility,
  linkVisibility: Visibility,
): Visibility {
  return VISIBILITY_RANK[assetVisibilityMax] <= VISIBILITY_RANK[linkVisibility]
    ? assetVisibilityMax
    : linkVisibility;
}

/** Pass/customer-facing surfaces only ever render links whose EFFECTIVE
 * visibility is `customer` — `shared_case` is a Pro-side, case-team-wide
 * visibility, not a customer-facing one, and `internal` never leaves staff
 * tooling (sección 10: "evidencia internal no aparece en Pass"). */
export function isEvidenceVisibleToCustomer(
  assetVisibilityMax: Visibility,
  linkVisibility: Visibility,
): boolean {
  return effectiveEvidenceVisibility(assetVisibilityMax, linkVisibility) === "customer";
}
