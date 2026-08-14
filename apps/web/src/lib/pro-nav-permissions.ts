import type { OrganizationPermission } from "@datatek/domain";

/** Permiso requerido para VER cada entrada de navegación de Pro en el menú
 * — no solo para poder entrar a la página. Antes de esto, `ProShell`
 * mostraba las mismas 12 entradas a cualquier rol (owner, advisor,
 * inspector, mechanic, cashier), y un actor sin el permiso solo se enteraba
 * al hacer clic y toparse con la pantalla de acceso denegado. Rutas sin
 * entrada aquí quedan visibles para cualquier membresía activa
 * (`organization.read`, que todo rol tiene).
 *
 * Refleja los mismos permisos que cada página ya exige vía
 * `getWebSession(orgSlug, "...")` — ver dashboard/cases/customers/vehicles/
 * shop `page.tsx`. Las rutas todavía no implementadas (calendar, finance,
 * inbox, loyalty, parts, reports, settings) usan el permiso que tiene más
 * sentido de dominio para el rol que las va a usar cuando se construyan. */
export const PRO_ROUTE_PERMISSION: Partial<Record<string, OrganizationPermission>> = {
  "pro.inbox": "intake.read",
  "pro.cases": "intake.read",
  "pro.case-workspace": "intake.read",
  "pro.calendar": "agenda.read",
  "pro.market-requests": "quote.read",
  "pro.shop": "catalog.read",
  "pro.customers": "crm.read",
  "pro.customer-detail": "crm.read",
  "pro.vehicles": "vehicle.read",
  "pro.vehicle-detail": "vehicle.read",
  "pro.parts": "parts.read",
  "pro.finance": "finance.read",
  "pro.reports": "audit.read_organization",
  "pro.loyalty": "catalog.manage",
  "pro.settings": "organization.manage",
};
