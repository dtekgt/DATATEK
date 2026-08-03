# R0-E Hardening — Fase 1 (migración `0090` + concurrencia + idempotencia)

**Fecha:** 2026-08-02
**Estado:** `implemented_pending_postgres_evidence` para la Parte A (migración
`0090`, artefacto SQL revisado estáticamente, no ejecutado); `verified_in_sandbox`
para las Partes B y C (código TypeScript real, corrido con `node --test`
contra el motor de comandos en memoria, no simulado).

Esta sesión es la Fase 1 de 4 de R0-E. No toca worker/seguridad/rate-limits
(Fase 2), observabilidad/rutas/performance (Fase 3), ni E2E/accesibilidad/
docs/reporte final (Fase 4) — esas quedan para sesiones futuras, tal como
pide `DATATEK_R0_E_HARDENING_HANDOFF.md`.

---

## Resultado real

- **Parte A (migración `0090`)**: escrita y revisada estáticamente. 8 views
  `security_invoker`, 1 función de lectura estrecha (reflejo 1:1 de
  `isVisibleToAudience`), 2 funciones de health/drift `security_definer`
  narrowly-scoped y gateadas por permiso, 3 índices justificados por
  patrones reales repetidos en `packages/application/src/queries/*.ts`, y 1
  columna nueva nullable (`idempotency_keys.input_hash`) que refleja el
  cambio de la Parte C. **No ejecutada contra Postgres real** — sin Docker/
  Supabase CLI en este sandbox, igual que `0000`–`0087`.
- **Parte B (concurrencia)**: 17 tests nuevos (`concurrency.test.ts`),
  todos verdes, cubriendo los 4 casos obligatorios de Agenda, 3 de Folios, 3
  de Freeze, 3 de Authorization y 3 de Evidencia (más allá de lo pedido,
  porque `ConfirmEvidenceUpload` SÍ existe como comando — ver sección de
  hallazgos). **Un hallazgo real de arquitectura** (no un bug de código):
  el motor de comandos es síncrono y single-threaded, así que
  `Promise.all` contra el mismo `engine` no crea una carrera real de dos
  hilos — se documenta con precisión qué SÍ prueba cada test (ver sección
  2.1).
- **Parte C (idempotencia)**: 12 tests nuevos (`idempotency.test.ts`). Se
  encontró y arregló **un bug real**: `findIdempotentReplay` nunca
  comparaba el contenido del input, así que una idempotency key reutilizada
  con un input DISTINTO devolvía en silencio el resultado viejo —
  exactamente lo que sección 7 prohíbe. Arreglado con un guard acotado
  (`checkIdempotencyKeyConflict`/`hashCommandInput`, `state.ts`) para los 6
  comandos obligatorios de sección 7. El resto de comandos del motor
  **conserva el comportamiento anterior** — deuda documentada, no resuelta
  en este pase (ver sección 3.3).
- **Pipeline completo**, corrido por esta sesión con output real (no
  asumido): `format:check`, `lint`, `typecheck`, `spec:check`, `test`,
  `build` — los 6 pasan. `test` pasó de **276 a 305** (+29, exactamente los
  tests nuevos de Partes B y C — verificado contando `it(` en los dos
  archivos nuevos).

---

## 1. Migración `0090` — qué se escribió y por qué es segura

Archivo: `supabase/migrations/0090_query_projections_and_health.sql`.
Cabecera honesta idéntica al patrón de `0000`–`0087`: "artefacto AUTORIZADO
PERO NO EJECUTADO", `implemented_pending_environment_evidence` hasta que una
sesión con Docker corra `pnpm db:reset && pnpm test:db`.

### 1.1 Diseño — "reflejar, no reinventar"

Antes de escribir SQL se leyeron los 8 query contracts TypeScript completos
(`packages/application/src/queries/*.ts`) y `docs/domain/query-contracts.md`/
`unwritten-tables.md`. La regla que gobernó cada decisión: una view/función
puede surtir las mismas filas candidatas que un query TypeScript ya lee
(un JOIN, un filtro objetivo, una "última fila por grupo"), pero **nunca**
la interpretación de esas filas (prioridades, truncamientos, textos,
mapeos de estado a acción). Esa línea se mantuvo estricta:

| Objeto SQL | Refleja (archivo TS, patrón exacto) | Qué NO hace |
|---|---|---|
| `case_latest_status_event` | `pass-case.ts`: última fila de `case_status_events` por caso | No traduce `to_status` a texto amigable (`friendlyCaseStatus` sigue en TS) |
| `case_active_assignment` | `pro-case-experience.ts`, `latestActiveAssignment()` | No resuelve nombre humano — `userId` crudo, igual que el query |
| `inspection_latest_completed` | `vehicle-now.ts` + `case-proof-summary.ts`: última inspección `completed` por caso | No decide "vencido" vs "sin alertas" — ese umbral (`STALE_AFTER_DAYS`) sigue en TS |
| `quote_version_frozen_current` | `pro-case-experience.ts` + `case-proof-summary.ts`: `find(status === 'frozen')` | No agrega un `UNIQUE` nuevo sobre `0080` (migración cerrada) |
| `authorization_request_live` | `pro-case-experience.ts` + `immediate-decisions.ts`: `LIVE_REQUEST_STATUSES` | No trunca a 3 (`max_immediate_decisions` sigue en TS) |
| `vehicle_access_grant_active` | `pass-home.ts`: `vehicleAccessGrants.filter(revokedAt == null)` | No une por VIN/placa — la regla "VIN/placa no otorgan lectura" (0030) queda intacta |
| `case_timeline_events` | Comentario de `authorization_events` en `0080`: "para timeline compartido Pro/Pass" | `event_key` es el enum crudo, nunca una etiqueta |
| `service_catalog_item_active_price` | `service-price-presentation.ts`: precio activo aplanado item+versión | Omite `note` — texto de condiciones queda para Fase 4b, no se inventa una transformación `conditions -> note` |
| `datatek_platform.is_visible_to_audience(text, text)` | `queries/shared.ts`, `isVisibleToAudience` | Espejo 1:1, una línea — nada más |

`getNextService` no recibe view propia: su único acceso es un filtro plano
por `vehicle_id`/`organization_id` sin JOIN ni "última fila por grupo" — ya
cubierto por `maintenance_recommendations_vehicle_idx` (0070). Se documenta
como "no aplica", no como omisión.

Todas las views usan `with (security_invoker = true)` — **nunca**
`security_definer` (riesgo de bypass de RLS, prohibido explícitamente en
sección 2 del handoff). Una view `security_invoker` ejecuta con los
privilegios del actor que consulta, así que las policies de `0020`–`0087`
sobre cada tabla base se siguen aplicando fila por fila exactamente igual
que si el cliente hubiera consultado la tabla directamente.

### 1.2 Funciones `security_definer` — sí las hay, y por qué son seguras

Dos funciones (`case_folio_counter_drift`, `outbox_health`) sí son
`security_definer`, porque necesitan agregar sobre tablas que
`0050`/`0085` deliberadamente NO otorgan a `authenticated`
(`organization_counters` es de uso interno; `outbox_messages` no tiene
`grant select` para `authenticated`, a propósito). Esto es distinto de una
VIEW `security_definer` (prohibido) — son funciones estrechas, con:

- `search_path` fijo (`pg_catalog, public`) — ley 28, mismo patrón que
  `has_org_permission`/`has_active_platform_membership` desde `0010`;
- gate de permiso explícito DENTRO de la función (`audit.read_organization`
  o soporte elevado con sesión activa) — sin esto, `security_definer`
  sería exactamente el "bypass de RLS" que la sección 2 prohíbe para
  views; al estar en una función con su propio chequeo, el aislamiento de
  tenant se mantiene;
- cero payload/configuración interna expuesta: `outbox_health` devuelve
  solo conteos por estado y una edad en segundos — nunca `last_error`,
  `locked_by` ni el `payload` de un mensaje (sección 2: "sin exponer
  configuración interna"; sección 13: sí permite "outbox lag" como métrica
  de health);
- sin corrección automática: `case_folio_counter_drift` solo LEE y
  reporta `expected_next_folio`/`max_issued_folio`/`drifted` — nunca
  ajusta el contador. Compara `organization_counters` (escrito hoy solo
  por el motor en memoria, vía `consumeOrganizationCounter`) contra el
  folio máximo real en `cases`, mismo `counter_key` (`'case_folio'`) que
  `packages/application/src/commands/intake-commands.ts` usa literalmente.

### 1.3 Índices — solo 3, cada uno justificado por código real

Ninguno especulativo. Cada uno cita el archivo/línea del query contract que
repite el mismo filtro+orden en más de un lugar:

1. `inspections_case_completed_idx (case_id, completed_at desc) where status = 'completed'`
   — `vehicle-now.ts` y `case-proof-summary.ts` hacen exactamente ese
   filtro+orden por separado.
2. `quote_versions_quote_frozen_idx (quote_id) where status = 'frozen'`
   — `pro-case-experience.ts` y `case-proof-summary.ts`.
3. `authorization_requests_case_live_idx (case_id) where status in ('prepared','sent','viewed')`
   — `pro-case-experience.ts` y `immediate-decisions.ts`; distinto del
   índice parcial ya existente en `0080` (`authorization_requests_pending_idx`,
   keyed por `quote_version_id`, no `case_id` — ambos queries entran por
   `case_id`, así que no es redundante).

### 1.4 Lo que esta migración explícitamente NO hizo

- No activó RLS por primera vez en ninguna tabla de `0000`–`0087` (todas ya
  la tenían).
- No creó ninguna materialized view (cero medición de performance en R0 que
  la justifique).
- No duplicó ninguna regla de negocio interpretativa (ver tabla 1.1).
- No expuso PII nueva — ninguna view/función agrega una columna de nombre/
  teléfono/email que no estuviera ya detrás de RLS existente.
- No editó ni "rescató" `0000`–`0087` — la única ALTER TABLE
  (`idempotency_keys add column input_hash`) es aditiva y nullable sobre
  una tabla de `0085`, evolución hacia adelante, no una edición de esa
  migración cerrada.

---

## 2. Concurrencia (sección 6) — 17 tests, todos verdes

Archivo: `packages/application/src/commands/concurrency.test.ts`.

### 2.1 Nota de arquitectura — léase antes de la tabla

El motor de comandos (`createCommandEngine()`, `engine.ts`) envuelve
funciones **puras y síncronas** sobre una variable `state` cerrada en el
closure. Node es single-threaded: `Promise.all([Promise.resolve().then(fnA),
Promise.resolve().then(fnB)])` encola dos microtareas en orden FIFO — `fnA`
corre HASTA COMPLETARSE (incluida su escritura) antes de que `fnB` empiece,
porque ninguna tiene un `await` interno. El orden entre "las dos llamadas
disparadas con `Promise.all`" es determinista (gana la primera de la
lista), no una carrera real de dos transacciones Postgres.

Esto **no invalida** la prueba: lo que sí es real y valioso es que la
SEGUNDA llamada — aunque "disparada al mismo tiempo" vía `Promise.all`
contra la MISMA instancia de `engine`, tal como pide la sección 6 — ve el
estado que la primera ya confirmó y es rechazada con un error de dominio
estable, nunca creando un segundo recurso en silencio. Es exactamente el
comportamiento real que tendría hoy el singleton de `apps/web` (ver el
comentario de `engine.ts`) si dos requests HTTP llegaran "al mismo tiempo"
a un único proceso Node.

Donde la distinción importa, un segundo test complementario invoca las
funciones puras de comando DIRECTAMENTE (sin pasar por el `engine`) contra
el MISMO snapshot de estado capturado una sola vez — eso sí modela con
fidelidad dos transacciones que leen ANTES de que cualquiera escriba, lo
más parecido a dos conexiones Postgres concurrentes que este motor en
memoria puede reproducir sin Postgres real.

### 2.2 Resultado por caso

| Área | Caso | Mecanismo del test | Resultado real |
|---|---|---|---|
| Agenda | Dos `ScheduleAppointment` mismo recurso/rango | `Promise.all` vía `engine` | ✅ Exactamente 1 reserva activa; la otra `CONFLICT` |
| Agenda | Mismo snapshot inicial (dos "transacciones" que leen antes de escribir) | funciones puras, mismo `state` | ⚠️ Ambas creen tener éxito — documentado como comportamiento esperado del motor en memoria; el `EXCLUDE` de `0060` es la fuente de verdad real en Postgres |
| Agenda | Hold que expira mientras se confirma | función pura, `now` avanzado tras `expiresAt` | ⚠️ **Brecha confirmada, no arreglada**: nada libera un hold vencido (sin worker en R0 — sección 8 del handoff lo difiere explícitamente); el recurso sigue bloqueado |
| Agenda | Cancelación + nueva reserva mismo slot | funciones puras, secuencial | ✅ La nueva reserva es válida |
| Agenda | Reintento con misma idempotency key | función pura, misma `ctx.idempotencyKey` | ✅ `replayed: true`, mismo `appointment.id`, una sola reserva |
| Folios | Dos `CreateCaseFromIntake` misma organización | `Promise.all` vía `engine` | ✅ Folios consecutivos únicos |
| Folios | Mismo snapshot inicial | funciones puras, mismo `state` | ⚠️ **Colisión real documentada**: ambas calculan el MISMO `folioNumber` — `consumeOrganizationCounter` (TS, en memoria) no es atómico frente a lectores concurrentes; el `UPDATE...RETURNING` de `next_organization_counter` (SQL, `0050`) sí lo sería en Postgres real |
| Folios | Dos organizaciones diferentes | `Promise.all` vía `engine` | ✅ Cada organización folio `1`, secuencias independientes, sin salto global |
| Freeze | Dos `FreezeQuoteVersion` misma `expectedVersionNumber` | `Promise.all` vía `engine` | ✅ Exactamente 1 gana, la otra `CONFLICT` |
| Freeze | `AddQuoteItem` concurrente durante freeze, ambos órdenes | llamadas explícitas en ambos órdenes | ✅ Orden A (freeze primero): edición falla limpio, `CONFLICT`, snapshot con 1 línea (nada a medio escribir). Orden B (edición primero): freeze la incluye legítimamente, snapshot con 2 líneas |
| Freeze | Reintento con misma idempotency key | función pura, mismo `ctx.idempotencyKey` | ✅ `replayed: true`, mismo hash, 1 sola versión frozen |
| Authorization | Doble submit mismo token, dos keys distintas | `Promise.all` vía `engine` | ✅ 1 decisión persiste; la otra `TOKEN_INVALID` (error neutral, sección 10.2) |
| Authorization | Mismo token, decisiones DISTINTAS (`accept_all` vs `reject`) | `Promise.all` vía `engine` | ✅ Resultado determinista, 1 sola `authorization` para el `authorizationRequestId` |
| Authorization | `RevokeAndReprepareAuthorizationRequest` vs decisión, ambos órdenes | llamadas explícitas en ambos órdenes | ✅ Orden A (revoke primero): decisión con token viejo falla `TOKEN_INVALID`. Orden B (decisión primero): revoke falla `CONFLICT` (solicitud ya no vigente). Nunca 2 decisiones válidas |
| Evidencia | Dos `ConfirmEvidenceUpload` mismo upload intent | `Promise.all` vía `engine` | ✅ 1 gana, la otra `CONFLICT`, 1 solo `evidence_asset` |
| Evidencia | Confirmar upload intent vencido | función pura, `now` tras `expiresAt` | ✅ `CONFLICT` limpio — brecha documentada: no existe `CancelUploadIntent`/`DeleteEvidence`, solo vencimiento natural |
| Evidencia | Dos `LinkEvidence` concurrentes, visibilidades distintas | `Promise.all` vía `engine` | ✅ Ambos se crean (diseño válido — multi-link por asset); `effectiveVisibility` nunca supera el techo (`internal`) del asset |

**Hallazgo de código arreglado en esta fase**: ninguno en Parte B — todo el
comportamiento de agenda/freeze/authorization ya era correcto bajo el
motor serializado. Los dos casos marcados ⚠️ arriba (hold vencido, race de
folio con snapshot compartido) son hallazgos REALES pero **no bugs de esta
fase**: el primero es una brecha ya anticipada por el propio comentario de
`resource_reservations_hold_expiry_idx` en `0060` ("worker de una ola
futura"); el segundo es inherente a que el motor en memoria no tiene
Postgres detrás — ambos quedan en la sección 4 (deuda).

---

## 3. Idempotencia (sección 7)

### 3.1 Campos de `IdempotencyRecord` — qué cumple, qué falta

Contra los 9 campos que sección 7 pide por comando reintentable:

| Campo requerido (sección 7) | ¿Existe en `IdempotencyRecord` hoy? | Detalle |
|---|---|---|
| namespace | Parcial | `commandName` cumple ese rol (combinado con `organizationId` en la clave de búsqueda), pero no hay un campo literal `namespace` separado |
| actor | ❌ No | `ctx.actorId` no se guarda en el registro — dos actores distintos con la misma key/comando no se distinguen |
| tenant | ✅ Sí | `organizationId` |
| idempotency key | ✅ Sí | `key` |
| hash de input | ⚠️ Parcial (nuevo en este pase) | `inputHash`, opcional — solo lo completan los 6 comandos obligatorios de sección 7 (ver 3.2). El resto de comandos no lo escriben |
| estado `processing/succeeded/failed` | ❌ No | Solo existe un estado implícito ("existe registro" = succeeded). Un comando que falla NUNCA llama `appendIdempotencyRecord` — no hay estado `processing` (sin soporte para detectar un comando interrumpido a medio camino) ni `failed` persistido |
| resultado serializable seguro | ✅ Sí | `resultSummary` |
| expiración/retención | ❌ No | Sin `expiresAt`/`archivedAt`/purga — los registros se acumulan indefinidamente en el array en memoria |
| correlation ID | ❌ No | `ctx.correlationId` existe y SÍ se guarda en `AuditEventRecord`, pero no se copia a `IdempotencyRecord` — no hay forma de cruzar un replay con su cadena causal directamente desde este registro |

**Conclusión honesta**: de 9 campos, 3 están completos (`tenant`, `key`,
`resultado`), 2 están parcialmente resueltos SOLO para 6 comandos
(`namespace` vía `commandName`, `hash de input`), y 4 no existen en
absoluto (`actor`, `estado processing/failed`, `expiración/retención`,
`correlation ID`). Esto es deuda real para una fase futura (probablemente
cuando `idempotency_keys` se escriba desde Postgres real vía un comando de
aplicación, no solo se refleje en schema como hoy).

### 3.2 El bug real: "misma key + input distinto" devolvía el resultado viejo

**Antes de este pase** — `findIdempotentReplay` (`state.ts`):

```ts
export function findIdempotentReplay<T>(
  state: CrmVehicleState,
  ctx: CommandContext,
  commandName: string,
): T | undefined {
  const found = state.idempotencyRecords.find(
    (r) =>
      r.organizationId === ctx.organizationId &&
      r.commandName === commandName &&
      r.key === ctx.idempotencyKey,
  );
  return found ? (found.resultSummary as T) : undefined;
}
```

Solo compara `(organizationId, commandName, key)` — **nunca el contenido
del input**. Un cliente que reutiliza una idempotency key con un input
DIFERENTE (p. ej. mismo `ScheduleAppointment` key pero horario distinto)
recibía en silencio el resultado de la primera llamada, como si su segunda
petición hubiera sido atendida — exactamente el escenario que sección 7
prohíbe explícitamente: *"misma key + input distinto falla"*.

**Después de este pase** — se agregó (`state.ts`):

- `IdempotencyRecord.inputHash?: string` — sha256 hex de un JSON canónico
  (claves ordenadas) del input, campo opcional.
- `hashCommandInput(input): string` — el hash mismo, `sha256` vía
  `node:crypto` (mismo patrón que `sha256Hex` ya usa
  `authorization-commands.ts` para el token).
- `checkIdempotencyKeyConflict(state, ctx, commandName, expectedInputHash): CommandError | null`
  — busca un registro previo con la misma `(organizationId, commandName, key)`
  cuyo `inputHash` almacenado sea distinto del esperado; si lo encuentra,
  devuelve `CONFLICT` con un mensaje claro. Si no hay registro previo, o el
  registro previo no tiene `inputHash` (comandos no migrados), o los hashes
  coinciden — devuelve `null` y el flujo continúa exactamente igual que
  antes.

Este guard se llama ANTES de `findIdempotentReplay` en los 6 comandos
obligatorios de sección 7, así que el flujo real quedó:

```
misma key + mismo input   -> checkIdempotencyKeyConflict: null -> findIdempotentReplay: HIT -> replay (sin cambios de comportamiento)
misma key + input distinto -> checkIdempotencyKeyConflict: CONFLICT -> el comando ni siquiera evalúa permisos/negocio
key nueva                  -> checkIdempotencyKeyConflict: null (sin registro previo) -> flujo normal
```

**Por qué el fix quedó acotado a 6 comandos y no a los ~20 del motor**: la
alternativa (hacer `inputHash` obligatorio y comparado en TODOS los
comandos) habría exigido tocar ~20 funciones más en 3 archivos adicionales
(`crm-commands.ts`, `vehicle-commands.ts`, y el resto de
`intake-commands.ts`/`agenda-commands.ts`/`inspection-commands.ts`/
`quote-commands.ts`/`authorization-commands.ts` que no están en la lista de
sección 7), sin que esta fase pudiera revisar con el mismo detalle sus
tests existentes para confirmar que ningún caso ya-verde dependía del
comportamiento viejo (replay solo por key). Es exactamente el tipo de
"rediseño grande" que el brief de esta fase pide documentar en vez de
parchar apresuradamente. El diseño elegido — `inputHash` opcional, guard
aditivo que no cambia nada para quien no lo usa — es seguro por
construcción: cero comandos existentes cambiaron de comportamiento; los 6
mandados ganaron exactamente la protección que sección 7 exige.

### 3.3 Comandos obligatorios — resultado por caso

| Comando | Misma key + mismo input | Misma key + input distinto |
|---|---|---|
| `CreateCaseFromIntake` | ✅ `replayed: true`, mismo caso/folio, 1 sola fila en `cases` | ✅ `CONFLICT`, mensaje contiene "input distinto", 0 casos nuevos |
| `ScheduleAppointment` | ✅ `replayed: true`, misma cita, 1 sola reserva | ✅ `CONFLICT`, 0 citas/reservas nuevas |
| `ConfirmEvidenceUpload` | ✅ `replayed: true`, mismo asset, 1 solo `evidence_asset` | ✅ `CONFLICT` (hash distinto no se cuela bajo la misma key), 0 assets nuevos |
| `FreezeQuoteVersion` | ✅ `replayed: true`, mismo hash/snapshot, 1 sola versión frozen | ✅ `CONFLICT`, 1 sola versión frozen (la original, intacta) |
| `PrepareAuthorizationRequest` | ✅ `replayed: true`, mismo request/token, sin doble transición de caso | ✅ `CONFLICT`, 1 sola solicitud para el caso |
| `RecordAuthorization` | ✅ `replayed: true`, misma autorización, token consumido una sola vez | ✅ `CONFLICT`, la decisión original (`accepted`) permanece intacta, no la reemplaza un `reject` posterior con la misma key |

`ConfirmEvidenceUpload` **sí existe** como comando (`inspection-commands.ts`)
— contrario a lo que el handoff contemplaba como posibilidad ("si no existe
todavía"). Se probó normalmente, sin necesidad de omitirlo de la lista.

### 3.4 Claves sin PII

Revisado en el código actual: `CommandContext.idempotencyKey` (`context.ts`)
es **siempre un string suministrado por el llamador** — `buildCommandContext`
lo recibe como parámetro obligatorio, ningún comando lo deriva de un campo
de cliente (nombre, teléfono, email). Confirmado leyendo los ~20 comandos
del motor: ninguno construye `idempotencyKey` a partir de `input.displayName`
ni de ningún dato personal. Las keys usadas en los tests de esta fase (p.
ej. `"conc-agenda-1-a"`, `"idem-case-same-key"`) son literales de prueba
sin relación con datos de un cliente real, consistente con esa misma regla.

**Límite honesto**: esto es verdad HOY por construcción (nada en el motor
genera keys desde PII), pero no hay ninguna validación en tiempo de
ejecución que lo haga cumplir — un futuro llamador (una Server Action, por
ejemplo) podría técnicamente pasar `idempotencyKey: customer.email` sin que
nada lo bloquee. Queda como hallazgo para R1/fases posteriores: un lint o
un `assert` en `buildCommandContext` que rechace patrones obviamente
PII-shaped (email, teléfono) sería una defensa adicional razonable, no
implementada en este pase.

---

## 4. Deuda y hallazgos explícitos para fases posteriores de R0-E / R1

Ninguno de los siguientes se "arregló silenciosamente" ni se presenta como
resuelto — se listan para que la fase que corresponda decida.

1. **`IdempotencyRecord` incompleto frente a sección 7** (detalle en 3.1):
   faltan `actor`, `estado processing/failed`, `expiración/retención`,
   `correlation ID`; `hash de input` solo cubre 6 de ~20 comandos. Requiere
   una fase dedicada, probablemente coordinada con cuando `idempotency_keys`
   (SQL) se escriba desde una transacción real en vez de solo reflejar el
   motor en memoria.
2. **Hold de agenda sin expiración automática** (`concurrency.test.ts`,
   caso "hold vencido"): `overlapsActiveReservation` nunca lee
   `expiresAt` de una reserva `hold` — un hold abandonado bloquea su slot
   indefinidamente. El propio índice `resource_reservations_hold_expiry_idx`
   (`0060`) ya lo anticipa ("soporta expirar holds vencidos en lote —
   worker de una ola futura"). No se implementó un worker en esta fase
   (fuera de alcance — sección 8 del handoff, Fase 2 de R0-E).
3. **`consumeOrganizationCounter` (TS) no es atómico frente a lectores
   concurrentes reales** (`concurrency.test.ts`, caso de folios con
   snapshot compartido): dos "transacciones" que leen el mismo
   `organization_counters.nextValue` antes de que cualquiera escriba
   calculan el MISMO folio. El motor en memoria de R0 es seguro solo
   porque Node es single-threaded y el `engine` serializa cada llamada real
   — no porque el algoritmo sea atómico. La fuente de verdad real
   (`datatek_platform.next_organization_counter`, `UPDATE ... RETURNING`,
   `0050`) sí es atómica en Postgres — este hallazgo documenta que el
   motor TypeScript por sí solo NO reproduce esa garantía si alguna vez se
   invocara desde más de un proceso.
4. **Sin comando `CancelUploadIntent`/`DeleteEvidence`**: "objeto eliminado
   antes de confirmar" (sección 6, Evidencia) no tiene equivalente real en
   R0 — solo vencimiento natural de `upload_intents.expires_at`. Se probó
   el caso de vencimiento como el análogo más cercano; una eliminación
   explícita queda para una fase futura si el producto la necesita.
5. **`ConfirmEvidenceUpload` sí existe** (corrección a la premisa del
   handoff, no un hallazgo nuevo): el comando estaba implementado desde
   R0-D Fase 2 (`inspection-commands.ts`). No hay nada que reportar como
   "faltante" aquí.
6. **Claves de idempotencia sin validación PII en runtime** (detalle en
   3.4): verdad por construcción hoy, sin guard activo.
7. **Migración `0090` no ejecutada contra Postgres real**: como toda
   migración de este proyecto en este sandbox — artefacto revisado
   estáticamente, `implemented_pending_environment_evidence`.
8. **`quote_version_frozen_current` no tiene un `UNIQUE` que garantice "a
   lo sumo una fila frozen por quote"**: en la práctica `CreateQuoteVersion`
   ya supersede la frozen anterior al crear una nueva, pero eso es
   disciplina de aplicación, no un constraint de base. Agregar ese
   `UNIQUE` sería alterar `0080` (migración cerrada) — no se hizo; se deja
   como posible mejora de una fase futura de hardening de constraints.

---

## 5. Pipeline — comandos exactos y resultado real

Corridos en esta sesión, en orden, desde `C:\Users\Dominic\Documents\Datatek gt\app`:

| Paso | Comando | Resultado |
|---|---|---|
| 1 | `pnpm format:check` | Falló la primera vez (3 archivos nuevos sin formatear) → `npx prettier --write` sobre esos 3 → **verde** en el re-run |
| 2 | `pnpm lint` (raíz, todos los workspaces) | **Verde** — 0 errores. 3 warnings preexistentes (`no-console` en `apps/worker`/`packages/domain`), ninguno de código nuevo de esta fase |
| 3 | `pnpm typecheck` (raíz, todos los workspaces) | **Verde** — 10/10 proyectos con typecheck, sin errores |
| 4 | `pnpm spec:check` | **Verde** — `"Generated spec artifacts match domain-spec.r0.yaml."` |
| 5 | `pnpm test` (raíz, todos los workspaces) | **Verde** — **305 tests, 305 pass, 0 fail** (antes: 276; delta +29, exactamente los tests nuevos de `concurrency.test.ts` [17] + `idempotency.test.ts` [12]) |
| 6 | `pnpm build` (raíz, todos los workspaces) | **Verde** — `apps/web` y `apps/control` compilan con webpack (SWC nativo bloqueado por Application Control, como en toda esta sandbox — comportamiento esperado, no un error nuevo); 26 rutas de `apps/web` y 14 de `apps/control` generadas |

Conteo de tests por paquete (esta sesión, `pnpm test` en la raíz):

| Paquete | Tests | Pass | Fail |
|---|---|---|---|
| `packages/database` | 2 | 2 | 0 |
| `packages/domain` | 68 | 68 | 0 |
| `packages/testkit` | 2 | 2 | 0 |
| `packages/auth` | 29 | 29 | 0 |
| `packages/application` | 172 | 172 | 0 |
| `packages/ui` | 18 | 18 | 0 |
| `apps/web` | 7 | 7 | 0 |
| `apps/control` | 7 | 7 | 0 |
| **Total** | **305** | **305** | **0** |

---

## 6. Archivos tocados en esta fase

- `supabase/migrations/0090_query_projections_and_health.sql` — nuevo.
- `packages/application/src/commands/state.ts` — agrega
  `IdempotencyRecord.inputHash`, `hashCommandInput`,
  `checkIdempotencyKeyConflict` (aditivo, sin romper ningún call site
  existente).
- `packages/application/src/commands/intake-commands.ts` — `checkIdempotencyKeyConflict`
  en `createCaseFromIntake`.
- `packages/application/src/commands/agenda-commands.ts` — ídem en
  `scheduleAppointment`.
- `packages/application/src/commands/inspection-commands.ts` — ídem en
  `confirmEvidenceUpload`.
- `packages/application/src/commands/quote-commands.ts` — ídem en
  `freezeQuoteVersion`.
- `packages/application/src/commands/authorization-commands.ts` — ídem en
  `prepareAuthorizationRequest` y `recordAuthorization`.
- `packages/application/src/commands/concurrency.test.ts` — nuevo, 17 tests.
- `packages/application/src/commands/idempotency.test.ts` — nuevo, 12 tests.

Ningún archivo de `apps/web`, `apps/control`, `apps/worker`, ni ninguna
migración `0000`–`0087` fue modificado. Ninguna operación de git se
ejecutó. Ningún servidor de desarrollo quedó corriendo al cierre de esta
sesión.
