// Query contracts — DATATEK_R0_D sección 3.1.
//
// A query is a PURE function: `(CrmVehicleState, QueryContext, ...) ->
// ViewModel | null`. No fetch, no hook, no component — same "functional
// core" discipline `commands/*.ts` already follows for writes (see
// `commands/engine.ts`'s header comment). Fase 4b's server
// loaders/components call these directly against `getCommandsEngine().
// getState()`; nothing in this file or its siblings performs I/O.
//
// Exported from the server-only `commands.ts` barrel (not the main
// "@datatek/application" client barrel) purely for architectural
// consistency with `CrmVehicleState` itself, which already lives there —
// see the comment on `packages/application/src/index.ts`. None of these
// query modules actually import `node:crypto` (they only need TYPES from
// `commands/state.ts`), but keeping the read side and the write side
// re-exported from the same seam means a future contributor who adds a
// runtime dependency to either one does not have to remember to also
// reconsider where it's exported from.
import type { ProjectionAudience } from "../viewmodels/audience.ts";

export type { ProjectionAudience };

export interface QueryContext {
  organizationId: string;
  /** Which projection this call is building — filters visibility (sección
   * 3.1: "filtra visibilidad") exactly like `ProjectionAudience` already
   * governs in `viewmodels/audience.ts`. `"pro"` sees internal +
   * shared_case + customer; `"pass"`/`"guest"` only ever see `customer`. */
  audience: ProjectionAudience;
  /** The resolved actor this query is being built FOR — never taken from
   * unauthenticated request input:
   *  - `"pro"`: the staff `auth.users.id` (used only for assignment/
   *    display lookups here, never for permission checks — a query never
   *    re-derives permission; the caller already resolved that the actor
   *    may reach this data before calling in, same division of labor
   *    `CommandContext.capabilities` establishes for writes).
   *  - `"pass"`: the linked `customers.id` for the authenticated account.
   *  - `"guest"`: the `customers.id` resolved from an ALREADY-VERIFIED
   *    `VerifyAuthorizationAccess` token — a query never verifies a token
   *    itself, it only trusts what the command layer already proved. */
  actorId: string;
  now: Date;
}
