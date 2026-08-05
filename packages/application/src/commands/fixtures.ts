// Seed data for the R0-D in-memory command engine — one provisional
// customer, one registered vehicle, and (Fase 2) one bookable resource per
// seeded organization (DTEK Servicios, Taller Demo), reusing the exact
// org/actor/branch ids from `../fixtures/tenancy.ts` (R0-C) so the
// isolation story stays consistent across R0-C and R0-D fixtures.
//
// The resource seed exists because R0-D Fase 2's command list (sección 3)
// has no `CreateResource` — `resources` is a table with RLS from `0060`
// but, same precedent as `vehicle_ownerships` in 0030 Fase 1, no writer
// command in this phase. Seeding one here is what makes `ScheduleAppointment`
// reachable at all before a later phase adds that command.
//
// Row ids here are fixed strings, not `crypto.randomUUID()` — sección 16:
// "Seeds deben poder reiniciarse y producir identificadores de referencia
// controlados para pruebas, sin asumirlos en lógica de negocio."
import {
  FIXTURE_ORGANIZATION_IDS,
  FIXTURE_ACTOR_IDS,
  FIXTURE_BRANCHES,
} from "../fixtures/tenancy.ts";
import {
  createEmptyState,
  type CrmVehicleState,
  type CustomerRow,
  type VehicleRow,
  type VehicleIdentifierRow,
  type VehicleAccessGrantRow,
  type VehicleOwnershipClaimRow,
  type ResourceRow,
  type ServiceCatalogItemRow,
  type ProductCatalogItemRow,
  type FeatureFlagRow,
  FEATURE_KEY_AUTHORIZATION_REISSUE,
} from "./state.ts";

export const FIXTURE_CRM_VEHICLE_IDS = {
  customerDtek: "cust-dtek-demo",
  customerDemo: "cust-demo-taller",
  vehicleDtek: "veh-dtek-corolla",
  vehicleDemo: "veh-demo-rio",
  resourceDtek: "res-dtek-bay-1",
  resourceDemo: "res-demo-bay-1",
} as const;

const SEED_AT = "2026-07-15T09:00:00.000Z";

export function buildFixtureCrmVehicleState(): CrmVehicleState {
  const base = createEmptyState();

  const customers: CustomerRow[] = [
    {
      id: FIXTURE_CRM_VEHICLE_IDS.customerDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      displayName: "Cliente Demo DTEK",
      customerType: "person",
      status: "provisional",
      source: "whatsapp_manual",
      createdAt: SEED_AT,
      effectiveAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.advisorDtek,
    },
    {
      id: FIXTURE_CRM_VEHICLE_IDS.customerDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      displayName: "Cliente Demo Taller Demo",
      customerType: "person",
      status: "provisional",
      source: "walk_in",
      createdAt: SEED_AT,
      effectiveAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.ownerDemo,
    },
  ];

  const vehicles: VehicleRow[] = [
    {
      id: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek,
      primaryVin: "1HGCM82633A004352",
      primaryPlate: "P123ABC",
      make: "Toyota",
      model: "Corolla",
      year: 2018,
      color: "Gris",
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.advisorDtek,
    },
    {
      id: FIXTURE_CRM_VEHICLE_IDS.vehicleDemo,
      primaryVin: "KNADH4A31F6123456",
      primaryPlate: "P321JKL",
      make: "Kia",
      model: "Rio",
      year: 2015,
      color: "Rojo",
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.ownerDemo,
    },
  ];

  const vehicleIdentifiers: VehicleIdentifierRow[] = [
    {
      id: "vid-dtek-vin",
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek,
      identifierType: "vin",
      normalizedValue: "1HGCM82633A004352",
      rawValue: "1HGCM82633A004352",
      recordedByOrganizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.advisorDtek,
    },
    {
      id: "vid-dtek-plate",
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek,
      identifierType: "plate",
      normalizedValue: "P123ABC",
      rawValue: "P-123ABC",
      recordedByOrganizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.advisorDtek,
    },
    {
      id: "vid-demo-vin",
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDemo,
      identifierType: "vin",
      normalizedValue: "KNADH4A31F6123456",
      rawValue: "KNADH4A31F6123456",
      recordedByOrganizationId: FIXTURE_ORGANIZATION_IDS.demo,
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.ownerDemo,
    },
    {
      id: "vid-demo-plate",
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDemo,
      identifierType: "plate",
      normalizedValue: "P321JKL",
      rawValue: "P-321JKL",
      recordedByOrganizationId: FIXTURE_ORGANIZATION_IDS.demo,
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.ownerDemo,
    },
  ];

  const vehicleAccessGrants: VehicleAccessGrantRow[] = [
    {
      id: "vag-dtek",
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek,
      grantedToCustomerId: FIXTURE_CRM_VEHICLE_IDS.customerDtek,
      scope: "read_own_case",
      source: "registration",
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.advisorDtek,
      revokedAt: null,
    },
    {
      id: "vag-demo",
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDemo,
      grantedToCustomerId: FIXTURE_CRM_VEHICLE_IDS.customerDemo,
      scope: "read_own_case",
      source: "registration",
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.ownerDemo,
      revokedAt: null,
    },
  ];

  const vehicleOwnershipClaims: VehicleOwnershipClaimRow[] = [
    {
      id: "voc-dtek",
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      customerId: FIXTURE_CRM_VEHICLE_IDS.customerDtek,
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDtek,
      claimKind: "self_reported",
      status: "provisional",
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.advisorDtek,
    },
    {
      id: "voc-demo",
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      customerId: FIXTURE_CRM_VEHICLE_IDS.customerDemo,
      vehicleId: FIXTURE_CRM_VEHICLE_IDS.vehicleDemo,
      claimKind: "self_reported",
      status: "provisional",
      createdAt: SEED_AT,
      createdBy: FIXTURE_ACTOR_IDS.ownerDemo,
    },
  ];

  // Fase 4a — DATATEK_R0_D sección 6 seed list, literal: "inspección de
  // frenos con fixed o inspection_required; servicio por eje con from o
  // range según condiciones; síntoma de vibración con diagnosis_required" —
  // one seeded row per `ServicePriceMode` so `getServicePricePresentation`
  // has real rows to read instead of a static fixture. Neutral/global (no
  // `organizationId`) — see the comment on `ServiceCatalogItemRow` in
  // state.ts.
  const serviceCatalogItems: ServiceCatalogItemRow[] = [
    {
      id: "svc-brake-inspection",
      key: "brake_inspection",
      name: "Diagnóstico / inspección de frenos",
      priceMode: "fixed",
      fixedAmountMinor: 15000,
      fromAmountMinor: null,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      note: null,
    },
    {
      id: "svc-axle-brake-service",
      key: "axle_brake_service",
      name: "Servicio de frenos por eje",
      priceMode: "from",
      fixedAmountMinor: null,
      fromAmountMinor: 45000,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      note: "Precio final depende del eje y las piezas requeridas.",
    },
    {
      id: "svc-full-brake-overhaul",
      key: "full_brake_overhaul",
      name: "Reparación completa de frenos (4 ruedas)",
      priceMode: "range",
      fixedAmountMinor: null,
      fromAmountMinor: null,
      rangeMinAmountMinor: 80000,
      rangeMaxAmountMinor: 145000,
      currency: "GTQ",
      note: null,
    },
    {
      id: "svc-brake-fluid-flush",
      key: "brake_fluid_flush",
      name: "Cambio de líquido de frenos",
      priceMode: "inspection_required",
      fixedAmountMinor: null,
      fromAmountMinor: null,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      note: "El precio final depende de una inspección presencial.",
    },
    {
      id: "svc-vibration-diagnosis",
      key: "vibration_diagnosis",
      name: "Diagnóstico de vibración al frenar",
      priceMode: "diagnosis_required",
      fixedAmountMinor: null,
      fromAmountMinor: null,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      note: "Se requiere diagnóstico técnico antes de cotizar.",
    },
  ];

  // Fase 4a — ola `0094`. A diferencia de serviceCatalogItems (neutral),
  // estas filas llevan organizationId — mismos productos que
  // supabase/seeds/local_actors.sql para que el motor en memoria y Postgres
  // cuenten la misma historia mientras no hay un adaptador real entre
  // ambos. Uno de DTEK queda con quantityOnHand: 0 a propósito (mismo
  // motivo que en el seed SQL: la UI futura necesita un caso "sin
  // existencia" que no tenga que inventar).
  const productCatalogItems: ProductCatalogItemRow[] = [
    {
      id: "prod-dtek-brake-pads",
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      sku: "DTEK-PAD-001",
      category: "frenos",
      name: "Pastillas de freno delanteras",
      brand: "Brembo",
      unit: "juego",
      priceMode: "fixed",
      fixedAmountMinor: 45000,
      fromAmountMinor: null,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      quantityOnHand: 6,
    },
    {
      id: "prod-dtek-engine-oil",
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      sku: "DTEK-OIL-005",
      category: "lubricantes",
      name: "Aceite de motor sintético 5W-30",
      brand: "Mobil 1",
      unit: "litro",
      priceMode: "fixed",
      fixedAmountMinor: 9500,
      fromAmountMinor: null,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      quantityOnHand: 0,
    },
    {
      id: "prod-demo-brake-pads",
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      sku: "DEMO-PAD-001",
      category: "frenos",
      name: "Pastillas de freno traseras",
      brand: "Bosch",
      unit: "juego",
      priceMode: "fixed",
      fixedAmountMinor: 38000,
      fromAmountMinor: null,
      rangeMinAmountMinor: null,
      rangeMaxAmountMinor: null,
      currency: "GTQ",
      quantityOnHand: 4,
    },
  ];

  // Fase 4a — ola `0086`. One real, checkable flag: `authorization_reissue`
  // gates `RevokeAndReprepareAuthorizationRequest`
  // (authorization-commands.ts). Both seeded organizations default to
  // enabled; no `featureFlagOverrides` seeded (tests construct an override
  // row directly to prove the gate — see authorization-commands.test.ts).
  const featureFlags: FeatureFlagRow[] = [
    {
      id: "flag-authorization-reissue",
      key: FEATURE_KEY_AUTHORIZATION_REISSUE,
      label: "Reenvío de solicitud de autorización",
      description:
        "Permite revocar y volver a preparar una solicitud de autorización vigente sobre la misma versión congelada, sin reabrir el caso (Fase 4a).",
      defaultEnabled: true,
      createdAt: SEED_AT,
      updatedAt: SEED_AT,
    },
  ];

  const resources: ResourceRow[] = [
    {
      id: FIXTURE_CRM_VEHICLE_IDS.resourceDtek,
      organizationId: FIXTURE_ORGANIZATION_IDS.dtek,
      branchId: FIXTURE_BRANCHES[FIXTURE_ORGANIZATION_IDS.dtek]?.[0]?.id ?? null,
      resourceType: "bay",
      label: "Bahía 1",
      isActive: true,
      createdAt: SEED_AT,
    },
    {
      id: FIXTURE_CRM_VEHICLE_IDS.resourceDemo,
      organizationId: FIXTURE_ORGANIZATION_IDS.demo,
      branchId: FIXTURE_BRANCHES[FIXTURE_ORGANIZATION_IDS.demo]?.[0]?.id ?? null,
      resourceType: "bay",
      label: "Bahía 1",
      isActive: true,
      createdAt: SEED_AT,
    },
  ];

  return {
    ...base,
    customers,
    vehicles,
    vehicleIdentifiers,
    vehicleAccessGrants,
    vehicleOwnershipClaims,
    resources,
    serviceCatalogItems,
    productCatalogItems,
    featureFlags,
  };
}
