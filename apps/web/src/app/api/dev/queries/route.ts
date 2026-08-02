import { NextResponse } from "next/server";
import { z } from "zod";
import { FIXTURE_ORGANIZATIONS } from "@datatek/application";
import {
  getPassHome,
  getPassCase,
  getVehicleNow,
  getNextService,
  getImmediateDecisions,
  getProCaseExperience,
  getCaseProofSummary,
  getServicePricePresentation,
  type QueryContext,
} from "@datatek/application/commands";
import { getCommandsEngine } from "../../../../lib/commands-engine";

// TEMPORARY DEV-ONLY ROUTE — DATATEK_R0_D Fase 4a.
//
// Same purpose and same disclaimers as ../commands/route.ts: this is
// scaffolding to make the 8 query contracts (sección 3.1) invokable and
// verifiable end-to-end with `curl` against the SAME in-memory engine the
// commands route mutates, not a product surface. A later phase replaces
// this with real server components/loaders calling these same pure query
// functions — the functions themselves do not change.
export const dynamic = "force-dynamic";

const QUERY_NAMES = [
  "getPassHome",
  "getPassCase",
  "getVehicleNow",
  "getNextService",
  "getImmediateDecisions",
  "getProCaseExperience",
  "getCaseProofSummary",
  "getServicePricePresentation",
] as const;
type QueryName = (typeof QUERY_NAMES)[number];

function isQueryName(value: unknown): value is QueryName {
  return typeof value === "string" && (QUERY_NAMES as readonly string[]).includes(value);
}

const requestSchema = z.object({
  query: z.string(),
  orgSlug: z.string(),
  audience: z.enum(["pro", "pass", "guest"]),
  actorId: z.string(),
  caseId: z.string().optional(),
  vehicleId: z.string().optional(),
  serviceId: z.string().optional(),
  now: z.string().optional(),
});

function devOnlyGuard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return null;
}

function runQuery(
  name: QueryName,
  ctx: QueryContext,
  params: { caseId?: string; vehicleId?: string; serviceId?: string },
) {
  const state = getCommandsEngine().getState();
  switch (name) {
    case "getPassHome":
      return { ok: true, data: getPassHome(state, ctx) };
    case "getPassCase":
      if (!params.caseId) return { ok: false, error: "caseId es obligatorio" };
      return { ok: true, data: getPassCase(state, ctx, params.caseId) };
    case "getVehicleNow":
      if (!params.vehicleId) return { ok: false, error: "vehicleId es obligatorio" };
      return { ok: true, data: getVehicleNow(state, ctx, params.vehicleId) };
    case "getNextService":
      if (!params.vehicleId) return { ok: false, error: "vehicleId es obligatorio" };
      return { ok: true, data: getNextService(state, ctx, params.vehicleId) };
    case "getImmediateDecisions":
      if (!params.vehicleId) return { ok: false, error: "vehicleId es obligatorio" };
      return { ok: true, data: getImmediateDecisions(state, ctx, params.vehicleId) };
    case "getProCaseExperience":
      if (!params.caseId) return { ok: false, error: "caseId es obligatorio" };
      return { ok: true, data: getProCaseExperience(state, ctx, params.caseId) };
    case "getCaseProofSummary":
      if (!params.caseId) return { ok: false, error: "caseId es obligatorio" };
      return { ok: true, data: getCaseProofSummary(state, ctx, params.caseId) };
    case "getServicePricePresentation":
      if (!params.serviceId) return { ok: false, error: "serviceId es obligatorio" };
      return { ok: true, data: getServicePricePresentation(state, ctx, params.serviceId) };
  }
}

function handle(parsed: z.infer<typeof requestSchema>): NextResponse {
  if (!isQueryName(parsed.query)) {
    return NextResponse.json({ error: "unknown_query", queries: QUERY_NAMES }, { status: 400 });
  }
  const org = FIXTURE_ORGANIZATIONS.find((o) => o.slug === parsed.orgSlug);
  if (!org) {
    return NextResponse.json({ error: "unknown_org" }, { status: 400 });
  }

  const ctx: QueryContext = {
    organizationId: org.id,
    audience: parsed.audience,
    actorId: parsed.actorId,
    now: parsed.now ? new Date(parsed.now) : new Date(),
  };

  const result = runQuery(parsed.query, ctx, {
    caseId: parsed.caseId,
    vehicleId: parsed.vehicleId,
    serviceId: parsed.serviceId,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export function GET(request: Request) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsedRequest = requestSchema.safeParse(raw);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsedRequest.error.issues },
      { status: 400 },
    );
  }
  return handle(parsedRequest.data);
}

export async function POST(request: Request) {
  const blocked = devOnlyGuard();
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsedRequest = requestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsedRequest.error.issues },
      { status: 400 },
    );
  }
  return handle(parsedRequest.data);
}
