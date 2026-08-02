# Tablas sin comando escritor — reconciliación R0-D (`0050`/`0060`)

El checkpoint de R0-D pidió reconciliar, tabla por tabla, cuáles de las
filas creadas por `0050_intake_cases.sql`/`0060_scheduling.sql` (R0-D
Fase 1/2) siguen sin un comando de aplicación que las escriba al cierre de
Fase 3 (`0080`, quote/autorización). Este documento cubre exactamente esas
tres — `case_blockers`, `resource_schedules`, `capacity_blocks` — más
`resources` (mencionada porque las otras dos dependen de ella y comparte el
mismo patrón). Todas tienen RLS/grants completos desde su migración de
origen (ley 27: ninguna tabla nace sin RLS aunque nazca sin escritor) — lo
que falta es el comando, no el schema.

| Tabla | Migración | ¿Cómo existe hoy en R0? | ¿Quién la escribiría (comando futuro)? | ¿Por qué no tiene comando todavía? |
|---|---|---|---|---|
| `resources` | `0060_scheduling.sql` | **Solo seed/fixture.** `packages/application/src/commands/fixtures.ts` inserta una fila fija por organización (`res-dtek-bay-1`, `res-demo-bay-1`) con ids controlados, no `crypto.randomUUID()` (sección 16: "identificadores de referencia controlados para pruebas"). Ningún comando de R0-D Fase 1/2/3 escribe aquí. | `CreateResource`/`UpdateResource` (owner, probablemente un permiso nuevo de configuración de sucursal, no `agenda.manage` — crear una bahía es una decisión de configuración del taller, no una operación diaria de agenda). | R0-D Fase 2 (sección 3, la lista de comandos canónicos de agenda) nunca incluyó gestión de recursos — solo su *uso* (`ScheduleAppointment`, `CreateTemporaryReservation`). El comentario en `fixtures.ts` es explícito: "el resource seed existe porque R0-D Fase 2's command list no tiene `CreateResource`... Seeding one here is lo que hace `ScheduleAppointment` alcanzable". Configuración de bahías/recursos es trabajo de una fase de "gestión operativa del taller", fuera del vertical de frenos que R0-D acota. |
| `case_blockers` | `0050_intake_cases.sql` | **Vacía — ni seed ni comando.** La tabla existe con RLS/índices completos (`case_blockers_case_idx`, `case_blockers_open_idx`) pero cero filas en cualquier fixture o comando actual. | `RaiseCaseBlocker`/`ResolveCaseBlocker` (staff con `intake.manage`, el mismo permiso que ya gobierna el resto del expediente de caso). | `case_blockers` respalda el campo "bloqueo opcional" que `ProCaseExperienceViewModel` debe mostrar (DATATEK_R0_D sección 9, tabla de "siguiente acción": *"Siempre incluye responsable o razón Sin asignar, vencimiento/espera, **bloqueo opcional** y completitud del respaldo"*) — es decir, es un campo de **proyección/lectura** que R0-D ya anticipó, pero ningún comando de sección 3 (Fase 1/2) ni sección 11/12 (Fase 3, quote/autorización) se llama "levantar/resolver un bloqueo". Es una función operativa adicional (ej. "esperando repuesto en bodega", "esperando aprobación de aseguradora") — correcto que quede para R1 sin comando propio en R0-D; no es un vacío accidental, es alcance explícitamente no cubierto. |
| `resource_schedules` | `0060_scheduling.sql` | **Vacía — ni seed ni comando, y tampoco tiene LECTOR todavía.** Más débil que `case_blockers`: ningún comando de agenda siquiera consulta esta tabla al validar disponibilidad. | `SetResourceSchedule` (probablemente owner/gestión de sucursal) para declarar el horario recurrente semanal (`weekday`, `starts_time`, `ends_time`, `timezone`) de una bahía o mecánico. | El propio comentario de la migración lo dice explícitamente: *"No enforced como constraint duro sobre `resource_reservations` en R0 — validación de disponibilidad es responsabilidad de la capa de aplicación, no de RLS/constraint"*. La capa de aplicación en cuestión (`overlapsActiveReservation`, `packages/application/src/commands/agenda-commands.ts`) solo compara contra `resource_reservations` activas — nunca contra un horario recurrente declarado. Escribir `resource_schedules` sin que ningún comando la lea todavía habría sido trabajo prematuro; ambas mitades (escritor + el chequeo que lo use) pertenecen a la misma fase futura de configuración de disponibilidad real por recurso. |
| `capacity_blocks` | `0060_scheduling.sql` | **Vacía — ni seed ni comando, mismo estado que `resource_schedules`.** | `BlockResourceCapacity`/`ReleaseResourceCapacity` (owner/advisor con permiso de agenda) para declarar cierres, mantenimiento o capacidad extra fuera del horario recurrente. | Mismo motivo que `resource_schedules`: es una excepción sobre un horario base que todavía no existe como dato vivo. Sin `resource_schedules` poblado, una excepción de capacidad no tiene contra qué "excepcionar". Ambas tablas de `0060` sección 3/4 quedan como el mismo tipo de trabajo futuro — gestión operativa de recursos — separado del vertical de frenos/quote/autorización que R0-D Fase 1–3 cubre. |

## Patrón común

Las cuatro filas de arriba siguen el mismo precedente que
`vehicle_ownerships` en `0030_vehicles_access.sql` (R0-D Fase 1, ver
`case-lifecycle.md`): **tabla completa con RLS desde su migración de
origen, documentada explícitamente como "sin escritor todavía" en el
comentario `comment on table ...` de la propia migración, nunca omitida
silenciosamente.** Ninguna de las cuatro bloquea el vertical de frenos
(inspección → evidencia → quote → autorización) que R0-D Fase 1–3 sí cubre
de punta a punta — son extensiones operativas (gestión de recursos,
bloqueos de caso) que el plan aprobado siempre dejó para una fase
posterior, no un vacío descubierto tarde.

## No confundir con la tabla de `evidence.md`/`case-lifecycle.md`

`docs/domain/evidence.md` documenta un pendiente relacionado pero distinto
(el job de limpieza de `upload_intents` huérfanos) y `case-lifecycle.md`
documenta `vehicle_ownerships` (verificación de propiedad) con el mismo
patrón — este documento es la versión expandida, en forma de tabla, de la
única línea que `case-lifecycle.md` ya tenía en su sección "Pendiente"
sobre `case_blockers`/`resource_schedules`/`capacity_blocks`.
