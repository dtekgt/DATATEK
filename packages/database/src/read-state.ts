// Estado de lectura híbrido: las 18 tablas de Puerta A (CRM + Vehículo +
// Intake/Caso) salen de Postgres real, escopeadas al actor/organización vía
// `withRlsRead` — el resto de `CrmVehicleState` (agenda, inspección,
// cotización, autorización, catálogo, feature flags) sigue viniendo del
// motor en memoria (`fallback`, el mismo `getState()` que ya usan las 7
// páginas de lectura de Pro hoy).
//
// Por qué un merge y no 7 proyecciones SQL a mano: `getProCaseExperience`/
// `getCaseProofSummary` (packages/application/src/commands) son funciones
// puras que leen `CrmVehicleState` completo — incluyen campos de dominios
// fuera de este corte (cotizaciones, autorizaciones) para calcular
// bloqueos/siguiente-acción. Pasarles un estado con SOLO lo que cada página
// filtra explícitamente les haría calcular mal para un caso real (creado
// por `openCaseFromRequest` en Postgres): el patrón ya establecido en todo
// Puerta A es "cargar el slice, correr la función pura sin tocarla" — acá
// el slice es "todas las tablas en alcance de este taller", no una por
// página.
//
// `vehicles`/`vehicleIdentifiers` no tienen `organization_id` (una
// identidad de vehículo es global, sección 5) — se resuelven desde los
// vehículos referenciados por los grants de ESTA organización, igual que ya
// hace cada página hoy vía `vehicleAccessGrants`.
import type pg from "pg";
import type { CrmVehicleState } from "@datatek/application/commands";
import { withRlsRead } from "./rls-read.ts";

async function loadOrgScoped<T>(
  client: pg.PoolClient,
  sql: string,
  organizationId: string,
  mapRow: (row: Record<string, unknown>) => T,
): Promise<T[]> {
  const { rows } = await client.query(sql, [organizationId]);
  return rows.map(mapRow);
}

function iso(value: unknown): string {
  return (value as Date).toISOString();
}
function isoOrNull(value: unknown): string | null {
  return value ? (value as Date).toISOString() : null;
}

export async function loadOrganizationReadState(
  pool: pg.Pool,
  actorId: string,
  organizationId: string,
  fallback: CrmVehicleState,
): Promise<CrmVehicleState> {
  return withRlsRead(pool, actorId, async (client) => {
    const customers = await loadOrgScoped(
      client,
      `select id, organization_id, display_name, customer_type, status, source, created_at, effective_at, created_by
         from customers where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["customers"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        displayName: r.display_name as string,
        customerType: r.customer_type as never,
        status: r.status as never,
        source: r.source as string,
        createdAt: iso(r.created_at),
        effectiveAt: iso(r.effective_at),
        createdBy: r.created_by as string,
      }),
    );

    const customerContacts = await loadOrgScoped(
      client,
      `select id, organization_id, customer_id, channel, normalized_value, raw_value, verified, verified_at, is_primary, created_at, created_by
         from customer_contacts where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["customerContacts"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        customerId: r.customer_id as string,
        channel: r.channel as never,
        normalizedValue: r.normalized_value as string,
        rawValue: r.raw_value as string,
        verified: r.verified as boolean,
        verifiedAt: isoOrNull(r.verified_at),
        isPrimary: r.is_primary as boolean,
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
      }),
    );

    const customerAuthLinks = await loadOrgScoped(
      client,
      `select id, organization_id, customer_id, user_id, status, verification_method, verified_at, created_at, created_by, revoked_at
         from customer_auth_links where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["customerAuthLinks"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        customerId: r.customer_id as string,
        userId: r.user_id as string,
        status: r.status as never,
        verificationMethod: r.verification_method as never,
        verifiedAt: iso(r.verified_at),
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
        revokedAt: isoOrNull(r.revoked_at),
      }),
    );

    const vehicleAccessGrants = await loadOrgScoped(
      client,
      `select id, organization_id, vehicle_id, granted_to_customer_id, scope, source, created_at, created_by, revoked_at
         from vehicle_access_grants where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["vehicleAccessGrants"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        vehicleId: r.vehicle_id as string,
        grantedToCustomerId: r.granted_to_customer_id as string | null,
        scope: r.scope as never,
        source: r.source as never,
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
        revokedAt: isoOrNull(r.revoked_at),
      }),
    );

    const vehicleIds = [...new Set(vehicleAccessGrants.map((g) => g.vehicleId))];
    const vehicles: CrmVehicleState["vehicles"] = vehicleIds.length
      ? (
          await client.query(
            `select id, primary_vin, primary_plate, make, model, year, color, created_at, created_by
               from vehicles where id = any($1::uuid[])`,
            [vehicleIds],
          )
        ).rows.map((r) => ({
          id: r.id as string,
          primaryVin: r.primary_vin as string | null,
          primaryPlate: r.primary_plate as string | null,
          make: r.make as string | null,
          model: r.model as string | null,
          year: r.year as number | null,
          color: r.color as string | null,
          createdAt: iso(r.created_at),
          createdBy: r.created_by as string,
        }))
      : [];

    const vehicleIdentifiers: CrmVehicleState["vehicleIdentifiers"] = vehicleIds.length
      ? (
          await client.query(
            `select id, vehicle_id, identifier_type, normalized_value, raw_value, recorded_by_organization_id, created_at, created_by
               from vehicle_identifiers where vehicle_id = any($1::uuid[])`,
            [vehicleIds],
          )
        ).rows.map((r) => ({
          id: r.id as string,
          vehicleId: r.vehicle_id as string,
          identifierType: r.identifier_type as never,
          normalizedValue: r.normalized_value as string,
          rawValue: r.raw_value as string,
          recordedByOrganizationId: r.recorded_by_organization_id as string,
          createdAt: iso(r.created_at),
          createdBy: r.created_by as string,
        }))
      : [];

    const vehicleOwnershipClaims = await loadOrgScoped(
      client,
      `select id, organization_id, customer_id, vehicle_id, claim_kind, status, created_at, created_by
         from vehicle_ownership_claims where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["vehicleOwnershipClaims"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        customerId: r.customer_id as string,
        vehicleId: r.vehicle_id as string,
        claimKind: r.claim_kind as never,
        status: r.status as never,
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
      }),
    );

    const vehicleOdometerEvents = await loadOrgScoped(
      client,
      `select id, vehicle_id, organization_id, recorded_at, value_km, raw_value, raw_unit, provenance, actor_id, status, conflict_reason, created_at
         from vehicle_odometer_events where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["vehicleOdometerEvents"][number] => ({
        id: r.id as string,
        vehicleId: r.vehicle_id as string,
        organizationId: r.organization_id as string,
        recordedAt: iso(r.recorded_at),
        valueKm: Number(r.value_km),
        rawValue: Number(r.raw_value),
        rawUnit: r.raw_unit as never,
        provenance: r.provenance as never,
        actorId: r.actor_id as string,
        status: r.status as never,
        conflictReason: r.conflict_reason as string | null,
        createdAt: iso(r.created_at),
      }),
    );

    const intakeThreads = await loadOrgScoped(
      client,
      `select id, organization_id, customer_id, channel, status, correlation_id, created_at, created_by
         from intake_threads where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["intakeThreads"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        customerId: r.customer_id as string | null,
        channel: r.channel as never,
        status: r.status as never,
        correlationId: r.correlation_id as string,
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
      }),
    );

    const intakeEntries = await loadOrgScoped(
      client,
      `select id, organization_id, thread_id, direction, original_text, referenced_files, reported_at, recorded_by, created_at
         from intake_entries where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["intakeEntries"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        threadId: r.thread_id as string,
        direction: r.direction as never,
        originalText: r.original_text as string,
        referencedFiles: (r.referenced_files as string[] | null) ?? [],
        reportedAt: iso(r.reported_at),
        recordedBy: r.recorded_by as string,
        createdAt: iso(r.created_at),
      }),
    );

    const cases = await loadOrgScoped(
      client,
      `select id, organization_id, branch_id, folio_number, folio_code, customer_id, vehicle_id, status,
              source_intake_thread_id, opened_at, closed_at, created_at, created_by
         from cases where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["cases"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        branchId: r.branch_id as string | null,
        folioNumber: Number(r.folio_number),
        folioCode: r.folio_code as string,
        customerId: r.customer_id as string,
        vehicleId: r.vehicle_id as string,
        status: r.status as never,
        sourceIntakeThreadId: r.source_intake_thread_id as string | null,
        openedAt: iso(r.opened_at),
        closedAt: isoOrNull(r.closed_at),
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
      }),
    );

    const caseParticipants = await loadOrgScoped(
      client,
      `select id, organization_id, case_id, customer_id, participant_kind, added_at, added_by
         from case_participants where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["caseParticipants"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        caseId: r.case_id as string,
        customerId: r.customer_id as string | null,
        participantKind: r.participant_kind as never,
        addedAt: iso(r.added_at),
        addedBy: r.added_by as string,
      }),
    );

    const caseAssignments = await loadOrgScoped(
      client,
      `select id, organization_id, case_id, role, user_id, assigned_at, assigned_by, unassigned_at, unassigned_by
         from case_assignments where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["caseAssignments"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        caseId: r.case_id as string,
        role: r.role as never,
        userId: r.user_id as string,
        assignedAt: iso(r.assigned_at),
        assignedBy: r.assigned_by as string,
        unassignedAt: isoOrNull(r.unassigned_at),
        unassignedBy: r.unassigned_by as string | null,
      }),
    );

    const serviceRequests = await loadOrgScoped(
      client,
      `select id, organization_id, case_id, source_intake_entry_id, summary, requested_at, created_at, created_by
         from service_requests where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["serviceRequests"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        caseId: r.case_id as string,
        sourceIntakeEntryId: r.source_intake_entry_id as string | null,
        summary: r.summary as string,
        requestedAt: iso(r.requested_at),
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
      }),
    );

    const reportedSymptoms = await loadOrgScoped(
      client,
      `select id, organization_id, case_id, service_request_id, source_intake_entry_id, symptom_code, description, reported_at, created_at, created_by
         from reported_symptoms where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["reportedSymptoms"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        caseId: r.case_id as string,
        serviceRequestId: r.service_request_id as string | null,
        sourceIntakeEntryId: r.source_intake_entry_id as string | null,
        symptomCode: r.symptom_code as string,
        description: r.description as string,
        reportedAt: iso(r.reported_at),
        createdAt: iso(r.created_at),
        createdBy: r.created_by as string,
      }),
    );

    const caseNotes = await loadOrgScoped(
      client,
      `select id, organization_id, case_id, visibility, body, author_id, created_at
         from case_notes where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["caseNotes"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        caseId: r.case_id as string,
        visibility: r.visibility as never,
        body: r.body as string,
        authorId: r.author_id as string,
        createdAt: iso(r.created_at),
      }),
    );

    const caseStatusEvents = await loadOrgScoped(
      client,
      `select id, organization_id, case_id, from_status, to_status, reason, actor_id, correlation_id, occurred_at, created_at
         from case_status_events where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["caseStatusEvents"][number] => ({
        id: r.id as string,
        organizationId: r.organization_id as string,
        caseId: r.case_id as string,
        fromStatus: r.from_status as never,
        toStatus: r.to_status as never,
        reason: r.reason as string | null,
        actorId: r.actor_id as string,
        correlationId: r.correlation_id as string | null,
        occurredAt: iso(r.occurred_at),
        createdAt: iso(r.created_at),
      }),
    );

    const organizationCounters = await loadOrgScoped(
      client,
      `select organization_id, counter_key, next_value from organization_counters where organization_id = $1`,
      organizationId,
      (r): CrmVehicleState["organizationCounters"][number] => ({
        organizationId: r.organization_id as string,
        counterKey: r.counter_key as string,
        nextValue: Number(r.next_value),
      }),
    );

    return {
      ...fallback,
      customers,
      customerContacts,
      customerAuthLinks,
      vehicles,
      vehicleIdentifiers,
      vehicleOwnershipClaims,
      vehicleAccessGrants,
      vehicleOdometerEvents,
      intakeThreads,
      intakeEntries,
      cases,
      caseParticipants,
      caseAssignments,
      serviceRequests,
      reportedSymptoms,
      caseNotes,
      caseStatusEvents,
      organizationCounters,
    };
  });
}
