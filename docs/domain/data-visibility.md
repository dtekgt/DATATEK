# Visibilidad de datos — AccessBoundary, audiencias y proyecciones

## AccessBoundary: 8 estados (sección 9)

`resolveAccessBoundaryState` (`packages/auth/src/tenancy.ts`) produce
exactamente uno de:

1. `loading_session`
2. `unauthenticated`
3. `membership_missing`
4. `membership_expired` (también cubre `suspended`/`revoked`)
5. `branch_denied`
6. `capability_denied`
7. `elevation_required`
8. `allowed`

`AccessBoundary` (`packages/ui/src/nav/shell-parts.tsx`) solo **presenta**
uno de estos 8 estados con `ForbiddenState`/`LoadingState`; nunca decide por
sí mismo. La decisión siempre viene del servidor:
`apps/web/src/lib/fixture-session.ts` (`getWebSession` /
`resolveWebSession`) hoy resuelve desde una cookie fixture httpOnly, porque
esta sandbox no puede emitir sesiones reales de Supabase Auth; el contrato de
tipos (`AccessBoundaryState`, `OrganizationCapabilityResolution`) es
idéntico al que producirá una sesión JWT real, así que R0-D solo cambia el
origen de los datos, no ningún componente consumidor.

## Proyecciones por audiencia (sección 5.5)

`packages/application/src/viewmodels/audience.ts` fija el contrato: un
ViewModel es una **proyección autorizada**, no un permiso.

- **Pass** (`PassHomeViewModel`, etc.) recibe únicamente hechos marcados
  `customer-visible` en las fixtures de dominio — nunca conteos internos ni
  el respaldo técnico de una recomendación.
- El **guest token** (`/a/[token]`) recibe solo audiencia, caso, versión y
  las acciones scoped al token — nunca una sesión general de Pass, nunca
  enumeración de otros casos/vehículos, nunca memberships heredadas.
- **Pro** recibe conteos internos únicamente cuando la capacidad efectiva del
  actor los cubre (ver `docs/domain/permissions.md`).
- `CaseProofSummary` tiene una proyección `internal` (Pro/Control) y una
  proyección `customer` (Pass/guest); son tipos y funciones de construcción
  distintos en `packages/application/src/viewmodels`, no el mismo objeto con
  campos condicionalmente ocultos en el cliente.
- Las claves de cache siempre incluyen `{ audiencia, tenant, scope }`; Control
  y las superficies de usuario **no comparten cache** (ver
  `packages/application/src/viewmodels/audience.test.ts`).

## Autorización guest (sección 5.6)

Un guest token:

- no crea una sesión general de Pass;
- no permite enumerar otros casos o vehículos (el resolver solo acepta el
  token exacto, nunca un listado);
- no hereda memberships de organización ni de plataforma;
- no expone la identidad interna completa del actor que generó el link (solo
  la etiqueta minimizada que corresponda a la audiencia `customer`);
- el receipt conserva el mismo scope que el token original y nunca lo amplía;
- reclamar una cuenta de Pass a partir de un guest token es un flujo
  **separado y opcional**, no implícito al abrir el link.

## Slugs, UUID y errores neutrales (sección 7)

- El UUID es la identidad interna real; `[orgSlug]` es únicamente
  presentación/routing (ver `docs/domain/route-registry.md`).
- Cambiar el slug de una organización inserta una fila en
  `organization_slug_history`; el slug anterior redirige, pero nunca revela
  la existencia de una organización privada a un actor no autorizado.
- Los folios (`organization_counters`) son secuenciales **por organización**,
  nunca globales — un folio nunca es, por sí solo, suficiente para ubicar un
  recurso entre tenants.
- Un UUID o slug de otro tenant nunca distingue "no existe" de "existe pero
  no lo puedes ver": ambos casos devuelven la misma respuesta neutral
  (`neutralResourceNotAvailable` en `packages/auth/src/tenancy.ts`):

```json
{
  "code": "RESOURCE_NOT_AVAILABLE",
  "message": "El recurso no está disponible para esta sesión.",
  "request_id": "..."
}
```

Los detalles internos (cuál constraint falló, qué política RLS bloqueó la
fila) van a observabilidad segura del servidor, nunca al navegador.

## Verificación

- `packages/auth/src/tenancy.test.ts` — dominio: aditividad de permisos,
  ventana de vigencia, branch scope, separación de roles de plataforma,
  expiración de sesión elevada, "owner no implica plataforma", los 8 estados
  de `AccessBoundary`.
- `packages/application/src/viewmodels/audience.test.ts` — Pass no recibe
  conteos internos, guest no obtiene `PassHomeViewModel`, claves de cache
  separan audiencia/tenant/scope.
- `supabase/tests/0010_identity_tenancy.sql` — mismas garantías verificadas
  bajo RLS real (`implemented_pending_environment_evidence` hasta que exista
  Docker/Postgres en esta sandbox; ver
  `docs/runbooks/database-reset.md`).
