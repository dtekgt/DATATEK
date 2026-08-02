# Inspección de frenos (R0-D Fase 2, ola `0070`)

Fuente normativa: `DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md` sección 9
y `DATATEK_R0_A_CONTRACT_PACK.md` sección 7 completa (contrato exacto de la
vertical de frenos). Este documento cubre solo lo que ya existe como código
verificado: los 6 comandos de aplicación de
`packages/application/src/commands/inspection-commands.ts` y el motor de
dominio que consumen (`packages/domain/src/inspection/`).

## Estado de la migración

`supabase/migrations/0070_inspection_evidence.sql` es un artefacto SQL
completo (12 tablas, constraints, índices, RLS, grants, seed del template
de frenos) revisado estáticamente pero **no ejecutado** — sin Postgres
alcanzable en esta sandbox. Ejecutarla queda pendiente hasta que una sesión
con Docker corra `pnpm db:reset && pnpm test:db`.

## Template versionado — una sola fuente de verdad, dos lugares

`packages/domain/src/inspection/brakes-template.ts` es la tabla literal de
R0-A sección 7.2 en TypeScript: 9 secciones, 12 items, cada uno con
`scope` (`axle_side` o `vehicle`) y `requiresMeasurement`. El seed SQL de
`0070_inspection_evidence.sql` (sección 14 del archivo) debe coincidir
EXACTAMENTE con esta tabla — no hay generador compartido para SQL en esta
fase, a diferencia de `domain-spec.r0.yaml`; si uno cambia, el otro se
actualiza en el mismo commit (advertencia explícita en la cabecera del
seed SQL).

`brakesTemplateRequiredSlots()` expande la tabla a la lista completa de
`(itemKey, axle, side)` que una inspección completa debe cubrir: los 8
items `axle_side` generan 4 combinaciones cada uno (`front`/`rear` ×
`left`/`right`) y los 4 items `vehicle` generan una sola combinación
(`axle`/`side` ambos `null`) — 36 slots requeridos en total.

## StartInspection — fija la versión al iniciar

`startInspection` (`inspection-commands.ts`) exige que el caso esté en
`received` (vía `resolveCaseTransition(kase.status, "inspection")`, ver
`docs/domain/case-lifecycle.md`) y fija `templateKey`/`templateVersionNumber`
desde `BRAKES_TEMPLATE_KEY`/`BRAKES_TEMPLATE_VERSION`
(`brakes-template.ts`), con `templateVersionStillActive: true`. Esta
referencia nunca cambia después — "template version fijado al iniciar"
(sección 9) — el motor en memoria no modela retiro de template todavía, así
que el flag siempre nace `true`.

## RecordInspectionResult / RecordMeasurement

`recordInspectionResult` clasifica CUALQUIER item del template
(`condition: pass|attention|fail|not_inspected|not_applicable`);
`recordMeasurement` adjunta el valor numérico exacto solo para los items
que lo requieren (`requiresMeasurement`) — "una condición no reemplaza la
medición cuando esta es requerida" (sección 7.2). Ambos comandos validan
antes de escribir:

- el `itemKey` debe pertenecer al template (`findBrakeItemDef`);
- eje/lado coherente con `scope` (`axle_side` exige ambos; `vehicle` exige
  ninguno);
- `not_inspected`/`not_applicable` exigen una nota no vacía con el motivo;
- `RecordMeasurement` usa `createMeasurement` (`@datatek/domain`) — unidad
  explícita, valor no negativo;
- un `inspection_result_id` solo admite una medición (`unique` en
  `measurements`, sección 7 SQL) — un segundo intento devuelve `CONFLICT`.

Corregir un resultado no sobrescribe la fila anterior: cada llamada calcula
`revisionNumber = filas previas para (itemKey, axle, side) + 1` y siempre
inserta — "resultados corregidos mediante nueva revisión" (sección 7.2).

## CompleteInspection — el gate vive en `packages/domain`

`completeInspection` nunca reimplementa la regla de sección 7.4 — solo
reúne el estado acumulado del motor (la revisión MÁS RECIENTE por cada
`(itemKey, axle, side)`, las mediciones correspondientes, si el template
sigue vigente, si queda evidencia requerida sin confirmar) y se lo pasa a
`evaluateBrakesCompletionGate` (`packages/domain/src/inspection/
completion-gate.ts`, con sus propios tests). El gate falla, literalmente,
si:

- faltan campos requeridos sin razón;
- una medición no tiene unidad;
- falta actor o momento;
- se usó un template no vigente al iniciar;
- evidencia requerida quedó en intención no confirmada (`upload_intents`
  `pending` de ese caso);
- existe un resultado inválido o un eje/lado incoherente.

Si el gate falla, el comando devuelve `VALIDATION` con todas las razones
concatenadas y **no muta nada** — ni la inspección ni el caso cambian de
estado. Si el gate pasa, `completeInspection` marca la inspección
`completed` y mueve el caso a `waiting_authorization` (vía
`resolveCaseTransition`). Pruebas:
`packages/application/src/commands/inspection-commands.test.ts` —
`"fails and does not transition the case when required fields are
missing"`, `"succeeds once every required slot is recorded"`, `"fails
when a required upload intent is still unconfirmed"`.

## Hallazgo y recomendación — separados a propósito

`recordFinding` separa observación/interpretación de la recomendación:
un finding tiene `urgency` y `visibility` propias y puede o no referenciar
un `inspectionResultId`. Un finding visible **no obliga a comprar**
(sección 9) — nada en el motor liga un finding a una acción automática.

`createMaintenanceRecommendation` delega el contrato EXACTO de R0-A
sección 4.15 a `assertValidMaintenanceRecommendationDraft`
(`packages/domain/src/inspection/maintenance-recommendation.ts`):

- `trigger_kind: "date"` exige `dueAt`, nunca `dueOdometerKm`;
- `trigger_kind: "odometer"` exige `dueOdometerKm`, nunca `dueAt`;
- `trigger_kind: "whichever_first"` exige ambos;
- `trigger_kind: "condition"` exige `customerExplanation`;
- `dueOdometerKm` nunca negativo.

`status` por defecto es `"unknown"` — "`unknown` no inventa vencimiento"
(sección 4.15): una recomendación creada sin una lectura confirmada nunca
adivina una fecha/kilometraje solo para parecer más certera.

## Derivación de `VehicleNow` (pendiente de query contract)

La prioridad de sección 9 (decisión crítica vigente → finding
customer-visible vigente → inspección reciente sin alertas → dato vencido
→ `unknown`) todavía no tiene un query contract en esta fase — los
comandos de este documento solo escriben las filas base
(`findings`, `maintenance_recommendations`, `inspection_results`) que una
fase posterior leerá para producir esa proyección.
