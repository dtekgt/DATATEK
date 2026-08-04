// Cross-cutting helpers shared by every query contract in this directory.
import type { Visibility } from "@datatek/domain";
import type { Money } from "../viewmodels/shared.ts";
import type { ProjectionAudience } from "./types.ts";

export const DATATEK_TIME_ZONE = "America/Guatemala";

/** All customer-facing dates use the business timezone explicitly. Server
 * locale/UTC defaults must never move a Guatemala event to another day. */
export function formatGuatemalaDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("es-GT", {
    ...options,
    timeZone: DATATEK_TIME_ZONE,
  }).format(date);
}

/** Cross-cutting visibility rule reused by every query that filters
 * findings/case notes/quote items by audience — mirrors
 * `isEvidenceVisibleToCustomer`
 * (packages/domain/src/evidence/visibility.ts): `shared_case` is Pro-side
 * (case-team-wide), never customer-facing; `internal` never leaves staff
 * tooling. Only `customer` clears the bar for `pass`/`guest`; `pro` sees
 * everything. */
export function isVisibleToAudience(visibility: Visibility, audience: ProjectionAudience): boolean {
  if (audience === "pro") return true;
  return visibility === "customer";
}

/** Presentation-only minor -> major conversion for the ViewModel's decimal
 * `Money` shape — assumes a 2-decimal minor unit (GTQ/USD, the only
 * currencies R0 seeds), same assumption `formatMoney`
 * (packages/domain/src/value-objects/money.ts) already makes for display. */
export function minorToMoney(amountMinor: number, currency: string): Money {
  return { amount: amountMinor / 100, currency };
}

/** `make model year`, skipping any missing part — shared by every query
 * that needs a human vehicle label from a bare `VehicleRow`. */
export function buildVehicleLabel(vehicle: {
  make: string | null;
  model: string | null;
  year: number | null;
}): string {
  const parts = [
    vehicle.make,
    vehicle.model,
    vehicle.year != null ? String(vehicle.year) : null,
  ].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(" ") : "Vehículo";
}

/** First token of a display name, falling back to a generic label — never
 * exposes a full internal name where only a first name belongs (mirrors
 * `minimizeActorLabelForCustomer` in viewmodels/audience.ts, applied here to
 * the CUSTOMER's own name for a first-person greeting instead of a staff
 * actor's name for a third-person label). */
export function firstNameOf(displayName: string | null | undefined): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) return "Cliente";
  return trimmed.split(/\s+/)[0] ?? "Cliente";
}
