# Query contracts (R0-D Fase 4a)

Fuente normativa: `DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md` sección
3.1. Implementados en `packages/application/src/queries/*.ts`, exportados
desde el barrel server-only `@datatek/application/commands` (mismo motivo
que `CrmVehicleState`/`engine.ts` — ver el comentario en
`packages/application/src/queries/types.ts`).

## Qué es un query contract aquí

Una función **pura**: `(CrmVehicleState, QueryContext, ...ids) -> ViewModel
| null`. Nada de fetch, nada de hook, nada de componente — mismo principio
"núcleo funcional" que ya sigue `commands/*.ts` para escrituras. Fase 4b
llama a estas funciones directamente desde server loaders/components contra
`getCommandsEngine().getState()`; nada en este directorio hace I/O.

`QueryContext` (`queries/types.ts`) resuelve actor y audiencia — reusa
`ProjectionAudience` (`"pro" | "pass" | "guest"`, ya definido en
`viewmodels/audience.ts`, sección 5.5 de R0-C) en vez de inventar un tipo
nuevo:

```ts
interface QueryContext {
  organizationId: string;
  audience: ProjectionAudience;
  actorId: string; // ver abajo
  now: Date;
}
```

`actorId` según audiencia — nunca tomado de input no verificado:

- `"pro"`: `auth.users.id` del staff (solo para labels de asignación aquí,
  nunca para chequear permisos — un query nunca re-deriva permisos; el
  llamador ya resolvió que el actor puede llegar a este dato antes de
  invocar, misma división de responsabilidad que `CommandContext.
  capabilities` ya establece para escrituras).
- `"pass"`: el `customers.id` vinculado a la cuenta autenticada.
- `"guest"`: el `customers.id` resuelto por un token YA VERIFICADO
  (`VerifyAuthorizationAccess`) — un query nunca verifica un token, solo
  confía en lo que la capa de comandos ya probó.

## Filtrado de visibilidad

`queries/shared.ts` centraliza la regla que reutiliza cada query que filtra
hallazgos/notas/evidencia por audiencia:

```ts
function isVisibleToAudience(visibility: Visibility, audience: ProjectionAudience): boolean {
  if (audience === "pro") return true;
  return visibility === "customer";
}
```

Mismo principio que `isEvidenceVisibleToCustomer`
(`packages/domain/src/evidence/visibility.ts`): `shared_case` es Pro-side
(todo el equipo del caso), nunca customer-facing; `internal` nunca sale de
herramientas de staff. Solo `customer` limpia la barra para `pass`/`guest`.

## Los 8 queries

| Query | Archivo | ViewModel | Puede devolver `null` |
|---|---|---|---|
| `getPassHome` | `pass-home.ts` | `PassHomeViewModel` | no (garage vacío es un array vacío, no null) |
| `getPassCase` | `pass-case.ts` | `PassCaseViewModel` | sí — caso inexistente o de otro cliente |
| `getVehicleNow` | `vehicle-now.ts` | `VehicleNowViewModel` | no — degrada a `status: "unknown"` |
| `getNextService` | `next-service.ts` | `NextServiceViewModel` | sí — sin recomendaciones todavía |
| `getImmediateDecisions` | `immediate-decisions.ts` | `ImmediateDecisionViewModel` | no — degrada a `decisions: []` |
| `getProCaseExperience` | `pro-case-experience.ts` | `CaseWorkspaceViewModel` | sí — caso inexistente |
| `getCaseProofSummary` | `case-proof-summary.ts` | `CaseProofSummaryViewModel` | sí — caso inexistente o de otro cliente |
| `getServicePricePresentation` | `service-price-presentation.ts` | `ServicePricePresentationViewModel` | sí — servicio inexistente |

Los tipos de ViewModel se **reusan** de R0-B (`viewmodels/pass.ts`,
`viewmodels/pro.ts`, `viewmodels/experience.ts`) — ninguno es nuevo. El
brief menciona `ProCaseExperienceViewModel` como alias de
`CaseWorkspaceViewModel`; solo el segundo existe como tipo, así que
`getProCaseExperience` devuelve ese.

### `getVehicleNow` — prioridad (sección 9)

`deriveVehicleNowFact` (exportado también para que `getPassHome` lo
reutilice por vehículo) implementa la prioridad literal de sección 9:

1. **decisión crítica vigente** → un `finding` visible para la audiencia
   con `urgency: "safety_critical"` → `status: "action_required"`.
2. **finding customer-visible vigente** → `urgency` `"urgent"` o
   `"attention"` → `status: "attention"`.
3. **inspección reciente sin alertas** → la inspección `completed` más
   reciente del vehículo, sin hallazgos de atención/urgente/crítico
   visibles, y dentro de una ventana de frescura → `status:
   "no_current_alerts"` (el `detail` siempre nombra el alcance: "Basado en
   la revisión de frenos del…" — nunca un porcentaje global).
4. **dato vencido** → la misma inspección, pero más vieja que
   `STALE_AFTER_DAYS = 180` → `status: "stale"`. Sección 9 nombra el orden
   de prioridad pero no un umbral numérico — 180 días es una interpretación
   documentada (aprox. dos intervalos típicos de servicio de frenos), no un
   valor tomado literalmente del documento normativo.
5. **`unknown`** → sin ninguna inspección completada → nunca inventa un
   estado a partir de datos ausentes.

`noFindingsIsNotHealthy: true` y `globalHealthScore: null` van fijos en
cada respuesta — ninguna combinación de datos puede hacer que el query
afirme "saludable" o produzca un puntaje global (ley 32 / `EXPERIENCE_SPEC.
global_vehicle_health_score = false`).

### `getImmediateDecisions` — truncamiento (máximo 3)

Elección de diseño explícita: este query trunca a
`EXPERIENCE_SPEC.max_immediate_decisions` (3) **en el query mismo**, no
solo confiando en que `ImmediateDecisionStack` (el componente de R0-B) lo
haga visualmente. Esto diverge a propósito de `getImmediateDecisionsViewModel`
(`adapters/pass-adapters.ts`), que entrega CUATRO decisiones fijas de
fixture porque ese adaptador existe para que el componente pruebe su
propia lógica de truncamiento en aislamiento (ver el comentario en
`ImmediateDecisionViewModel`, `viewmodels/experience.ts`: "so a fixture can
prove the enforcement"). Ese razonamiento es específico de un fixture
construido para probar la UI. Este query es el punto por el que Fase 4b
llamará con datos reales; truncar en el origen es defensa en profundidad —
cualquier consumidor futuro que lea este ViewModel sin pasar por ese
componente (un digest de notificaciones, un resumen renderizado en
servidor) tampoco ve nunca más de tres. `immediate-decisions.test.ts`
prueba el truncamiento construyendo 4 solicitudes vigentes reales para el
mismo cliente.

### `getProCaseExperience` — una sola siguiente acción (sección 15)

Implementa la tabla literal de sección 15:

| Estado del caso | `primaryAction` |
|---|---|
| `new`/`triage` | "Hacer triage del caso" |
| `waiting_customer` | "Esperar respuesta del cliente" |
| `scheduled` | "Recibir vehículo" |
| `received` | "Iniciar inspección" |
| `inspection`, inspección no completada | "Completar inspección de frenos" |
| `inspection`, completada, sin quote | "Crear cotización" |
| `inspection`, quote sin congelar | "Completar y congelar la cotización" |
| `inspection`, versión frozen sin solicitud | "Preparar solicitud de autorización" |
| `waiting_authorization`, request `prepared` | "Enviar solicitud de autorización" |
| `waiting_authorization`, request `sent`/`viewed` | "Esperar la decisión del cliente (o reenviar el enlace)" |
| `ready` | "Siguiente etapa: Planificada (reparación) — R1" |
| `closed` | "Caso cerrado — cliente no autorizó" |
| cualquier otro (R1+, fuera del alcance de la vertical de frenos) | placeholder honesto, nunca lógica de R1 inventada |

`blockers` siempre `[]` para un caso real — `case_blockers` no tiene
comando escritor todavía (`docs/domain/unwritten-tables.md`), a diferencia
del adaptador de fixture que sí muestra un `DEMO_BLOCKERS` estático.

`assignee` es el `userId` crudo de la asignación activa más reciente para
el rol relevante (`advisor`/`inspector`) — `CrmVehicleState` no tiene una
tabla `user_profiles` (esa vive en el fixture de tenencia de R0-C, no en el
motor de comandos), así que resolver un nombre humano legible queda
explícitamente para Fase 4b, cuando pueda unir contra un perfil real.

**Corrección de una laguna real encontrada al construir este query**:
`CASE_STAGE_ORDER` (`fixtures/cases.ts`, reutilizado aquí para el stage
rail) no incluía el estado `"ready"` — donde un caso aterriza justo después
de que `RecordAuthorization` acepta total o parcialmente. Ningún llamador
anterior (los dos casos de demo del adaptador de fixture) usaba ese estado
exacto, así que el hueco quedó silencioso hasta que `getProCaseExperience`
se convirtió en el primer llamador REAL en alcanzarlo. Corregido insertando
`"ready"` entre `"waiting_authorization"` e `"in_progress"` — ver el
comentario en el archivo.

### `getCaseProofSummary` — nunca éxito falso

`completedSuccessfully` es un literal de tipo `false`
(`CaseProofSummaryViewModel`) — el query no puede sobreescribirlo aunque
quisiera. `evidenceCount` solo cuenta `evidence_assets` con estado
`uploaded`/`verified` (nunca `pending_upload`/`rejected`/`invalidated`) Y
cuya visibilidad EFECTIVA (`effectiveEvidenceVisibility`, dominio) limpia
la audiencia — un asset interno con un link mal etiquetado `customer` sigue
sin contar para `pass`/`guest` (sección 8.3: "un link incorrecto no puede
volver pública una evidencia interna"). `case-proof-summary.test.ts` prueba
ambos ejes por separado (confirmado-vs-pendiente, interno-vs-cliente).

### `getServicePricePresentation` — catálogo mínimo real

A diferencia de los otros siete, este query lee de una tabla que R0-D Fase
1-3 nunca modeló en el motor de comandos: el catálogo (`0040`) nunca tuvo
comandos de escritura. Para que este query lea de `CrmVehicleState` real
(no de la fixture estática `fixtures/pricing.ts`) en vez de fingir datos,
Fase 4a agrega `ServiceCatalogItemRow`/`state.serviceCatalogItems` — una
tabla real, **seedeada, sin comando escritor todavía** (mismo precedente
que `resources` en `0060` antes de que existiera `CreateResource`). El seed
(`commands/fixtures.ts`) cubre las cinco `service_price_modes` con datos
del propio seed mínimo que sección 6 de R0-D pide ("inspección de frenos
con fixed o inspection_required; servicio por eje con from o range;
síntoma de vibración con diagnosis_required").

## Lo que NO existe todavía (explícito, no accidental)

- **`SetFeatureFlagOverride`** — no hay comando para togglear un override
  de `feature_flag_overrides` por organización. Hoy solo se prueba
  insertando la fila directamente en un test (ver
  `authorization-commands.test.ts`, helper `withReissueFlag`).
- **Nombres humanos en `getProCaseExperience`** — `assignee` es un
  `userId` crudo; unir contra un perfil real es trabajo de Fase 4b.
- **`getServicePricePresentation` sin overrides por organización** — R0
  nunca implementa `service_catalog_overrides`; el catálogo es neutral
  (sección 6), así que `ctx.organizationId` se acepta por uniformidad de
  firma pero no se usa todavía.
- **Ningún query llama a Postgres** — todos leen `CrmVehicleState` en
  memoria (`getCommandsEngine().getState()`). Migrar cada uno a leer de
  Postgres real es exactamente el trabajo de Fase 4b; ningún query cambia
  de firma para eso (mismo principio que los adapters de R0-B).

## Verificación

- Unitaria: un archivo `*.test.ts` por query en
  `packages/application/src/queries/`, construido contra el motor de
  comandos real (`packages/application/src/queries/query-test-helpers.ts`)
  — nunca contra un ViewModel armado a mano.
- HTTP: `apps/web/src/app/api/dev/queries/route.ts` (GET o POST,
  `{ query, orgSlug, audience, actorId, caseId?, vehicleId?, serviceId?,
  now? }`) expone los 8 contra el mismo engine singleton que
  `/api/dev/commands` muta — mismo patrón, mismo disclaimer de
  "scaffolding, no un endpoint de producción".
