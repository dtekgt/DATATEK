# Permisos — catálogo, roles y resolución

Fuente canónica: `packages/domain/spec/domain-spec.r0.yaml` (secciones
`organization_permissions`, `platform_permissions`,
`organization_role_templates`, `platform_role_templates`) — generada a
`packages/domain/generated/spec.constants.ts` vía `pnpm spec:generate`. La
migración `0010` (tablas `permissions`, `role_templates`,
`role_template_permissions`, `platform_role_templates`,
`platform_role_permissions`) es un espejo ejecutable de ese mismo catálogo;
`supabase/seeds/local_actors.sql` los inserta literalmente para que el seed
local sea reproducible sin depender de Node dentro de `psql`.

## Modelo aditivo, sin deny explícito

Una membresía puede tener varios roles activos (`membership_roles`); sus
permisos se **unen** (aditivo). R0 no implementa un permiso `deny` — quitar
acceso significa quitar el rol o revocar/suspender la membership, nunca
agregar una excepción negativa. Esto está probado en
`packages/auth/src/tenancy.ts` (`resolveOrganizationCapabilities`) y en
`supabase/tests/0010_identity_tenancy.sql`.

## Permisos de organización

| Permiso | Uso |
|---|---|
| `organization.read` | Leer datos de la organización |
| `organization.manage` | Administrar la organización |
| `branch.manage` | Administrar sucursales |
| `membership.read` | Leer membresías |
| `membership.manage` | Administrar membresías |
| `role.assign` | Asignar roles |
| `catalog.read` / `catalog.manage` | Catálogo de servicios |
| `audit.read_organization` | Auditoría de la organización |

Reservados para R0-D+ (seed-eados ya, sin entidad activa en R0-C, para no
cambiar IDs de rol después — sección 4): `crm.read`, `crm.manage`,
`vehicle.read`, `vehicle.manage`, `intake.read`, `intake.manage`,
`agenda.read`, `agenda.manage`, `inspection.read`, `inspection.publish`,
`quote.read`, `quote.manage`, `authorization.request`,
`authorization.decide`, `work.read`, `work.manage`, `quality.manage`,
`finance.read`, `finance.manage`.

## Permisos de plataforma

| Permiso | Uso |
|---|---|
| `platform.control.enter` | Entrar a Datatek Control |
| `platform.organization.manage` | Administrar organizaciones desde Control |
| `platform.catalog.manage` | Catálogo global |
| `platform.feature.manage` | Feature flags |
| `platform.support.manage` | Administrar soporte |
| `platform.security.read` | Leer seguridad |
| `platform.audit.read` | Leer auditoría de plataforma |
| `platform.access.request` | Solicitar acceso elevado |
| `platform.access.approve` | Aprobar acceso elevado |
| `platform.access.use` | Usar una sesión de acceso elevado |

## Roles de organización → permisos

Owner recibe todos los permisos de organización, incluidos los reservados
R0-D+. Advisor, Inspector, Mechanic, Cashier y Customer reciben subconjuntos
funcionales (ver `organization_role_templates` en el domain spec para el
mapeo exacto). Ningún rol de organización recibe un permiso `platform.*`.

## Roles de plataforma → permisos

`platform_support`, `platform_security`, `platform_admin` y
`platform_auditor` son independientes de cualquier rol de organización
(sección 2.4). Un Owner de DTEK no obtiene nada de plataforma; un
`platform_admin` no obtiene automáticamente membership en ninguna
organización — el "owner no implica plataforma" se prueba explícitamente
(caso 13 de `supabase/tests/0010_identity_tenancy.sql` y el test de dominio
correspondiente en `packages/auth/src/tenancy.test.ts`).

## Capacidades de experiencia mapeadas a comandos (sección 4)

Estas seis decisiones semánticas no son "un componente visible/oculto"; son
comandos/datos concretos:

| Capacidad | Comando/dato que resuelve | Permiso |
|---|---|---|
| Leer recomendación | `GetVehicleRecommendation` (R0-D) | `vehicle.read` |
| Publicar evidencia | `PublishInspectionEvidence` (R0-D) | `inspection.publish` |
| Ver respaldo interno | Proyección `internal` de `CaseProofSummary` | `work.read` + audiencia `internal` |
| Ver decisión | `GetAuthorizationDecision` (R0-D) | `authorization.decide` (mutar) / `quote.read` (leer) |
| Reenviar o revocar solicitud | `ResendAuthorizationRequest` / `RevokeAuthorizationRequest` (R0-D) | `authorization.request` |
| Editar modalidad de precio | `UpdateServicePriceMode` (R0-D) | `catalog.manage` |

Estos comandos aún no existen como entidades ejecutables en R0-C (sección 1
los excluye explícitamente); el mapeo se documenta ahora para que R0-D no
tenga que inventar IDs de permiso nuevos ni renombrar roles ya asignados.

## Resolución en runtime

`packages/auth/src/tenancy.ts` expone las funciones puras que backean tanto
Postgres (vía los helpers `datatek_platform.*` de la migración `0010`) como
las fixtures de `packages/application/src/fixtures/tenancy.ts` con el mismo
contrato:

- `resolveOrganizationCapabilities(actorUserId, organizationId, now, snapshot)`
- `isBranchAllowed(branchScope, branchId)`
- `resolvePlatformCapabilities(actorUserId, now, snapshot)`
- `resolveActiveSupportAccessSession(platformMembershipId, organizationId, now, sessions)`
- `resolveAccessBoundaryState(ctx)` — produce uno de los 8 estados de
  `AccessBoundary` (ver `docs/domain/data-visibility.md`).

Ningún permiso ni `organization_id` se acepta ciegamente desde el navegador
(sección 5.1): el servidor siempre resuelve desde la sesión/cookie/JWT, no
desde un input del cliente.
