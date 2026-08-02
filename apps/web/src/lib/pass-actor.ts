// Server-only helper — resolves WHICH customer/organization a Pass page
// reads real engine data for.
//
// R0 never built a Pass/customer authentication session (unlike Pro, which
// has `getWebSession`/`SESSION_COOKIE_NAME` from R0-C) — every existing
// `/pass/*` page today renders unconditionally, with no identity check of
// any kind. Fase 4b does not invent one either (that is real auth work, out
// of this phase's scope); instead it accepts an OPTIONAL `?actor=<customer
// id>&org=<org slug>` query pair, purely for demonstrating that Pass
// reflects real engine state — never a security boundary (there isn't one
// here yet, exactly like today). Omitting both defaults to the seeded demo
// customer (`cust-dtek-demo`, `dtek-servicios`) that
// `commands/fixtures.ts` already seeds with a real vehicle + access grant,
// so the home/garage pages show something real out of the box without
// requiring anyone to have created data first.
import { FIXTURE_CRM_VEHICLE_IDS } from "@datatek/application/commands";
import { resolveOrgBySlug } from "./command-context";

export const DEFAULT_PASS_ORG_SLUG = "dtek-servicios";
export const DEFAULT_PASS_CUSTOMER_ID = FIXTURE_CRM_VEHICLE_IDS.customerDtek;

export interface PassActorResolution {
  organizationId: string;
  orgSlug: string;
  actorId: string;
}

export function resolvePassActor(searchParams?: {
  org?: string | string[];
  actor?: string | string[];
}): PassActorResolution | null {
  const orgSlugParam = Array.isArray(searchParams?.org) ? searchParams?.org[0] : searchParams?.org;
  const actorParam = Array.isArray(searchParams?.actor)
    ? searchParams?.actor[0]
    : searchParams?.actor;

  const orgSlug = orgSlugParam ?? DEFAULT_PASS_ORG_SLUG;
  const actorId = actorParam ?? DEFAULT_PASS_CUSTOMER_ID;

  const org = resolveOrgBySlug(orgSlug);
  if (!org) return null;

  return { organizationId: org.id, orgSlug, actorId };
}
