# Case lifecycle — CRM, vehículo, intake, caso, agenda (R0-D Fase 1 + Fase 2)

Este documento crece con cada fase de R0-D. **Fase 1 cubre CRM (`0020`) y
vehículo/acceso (`0030`); Fase 2 agrega intake/caso (`0050`) y agenda
(`0060`)**, más los comandos de inspección/evidencia (`0070`) documentados
en `docs/domain/brakes-slice.md` y `docs/domain/evidence.md`. **Fase 3
agrega quote y autorización (`0080`)** — 10 comandos en
`packages/application/src/commands/quote-commands.ts` y
`authorization-commands.ts`, documentados en
`docs/adr/0003-quote-versioning.md` y `docs/domain/authorization-security.md`.
`0085`–`0087` (trabajo/calidad/finanzas) siguen sin implementar — llegan en
fases posteriores del mismo plan aprobado. La sección 1 completa del
documento normativo (`DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md`) lista
la secuencia completa de olas; aquí solo se documenta lo que ya existe como
código verificado.

## Alcance de esta fase

| Migración | Tablas | Estado |
|---|---|---|
| `0020_crm.sql` | `customers`, `customer_contacts`, `customer_auth_links`, `customer_consents`, `customer_communication_preferences` | Escrita, NO ejecutada (sin Postgres en esta sandbox) |
| `0030_vehicles_access.sql` | `vehicles`, `vehicle_identifiers`, `vehicle_ownership_claims`, `vehicle_ownerships`, `vehicle_access_grants`, `vehicle_odometer_events` | Escrita, NO ejecutada |
| `0040_catalog.sql` | `service_catalog_items`, `service_catalog_versions`, `service_catalog_overrides`, `labor_operations` | Escrita, NO ejecutada |
| `0050_intake_cases.sql` | `intake_threads`, `intake_entries`, `cases`, `case_participants`, `case_assignments`, `service_requests`, `reported_symptoms`, `case_notes`, `case_status_events`, `case_blockers` | Escrita, NO ejecutada |
| `0060_scheduling.sql` | `resources`, `resource_capabilities`, `resource_schedules`, `capacity_blocks`, `appointments`, `appointment_resources`, `assignment_events`, `resource_reservations` | Escrita, NO ejecutada |

Las cinco migraciones son artefactos SQL completos (schema, constraints,
índices, RLS, grants, seed mínimo) revisados estáticamente. Ejecutarlas
contra Postgres real queda pendiente hasta que una sesión con Docker corra
`pnpm db:reset && pnpm test:db` — ver la cabecera de cada archivo en
`supabase/migrations/` y las pruebas pgTAP correspondientes en
`supabase/tests/`.

Lo que SÍ está verificado en esta fase, de extremo a extremo y en verde,
son los 26 comandos de aplicación (6 de Fase 1 + 7 de intake/caso + 5 de
agenda de Fase 2 — inspección/evidencia se documentan aparte en
`brakes-slice.md`/`evidence.md`) y el motor de fixtures en memoria que los
ejercita — ver más abajo.

## Modelo: cliente local, vehículo global

`customers` es una relación **local** a la organización (R0-A sección
4.13: "relación local, nunca global"). Dos organizaciones nunca comparten
una fila de `customers`, aunque describan a la misma persona real — la
deduplicación entre talleres es tarea de Control, fuera de alcance de R0.

`vehicles`/`vehicle_identifiers` son, al revés, **globales** — sin
`organization_id`. Un VIN o placa nombra un vehículo físico único
independientemente de a qué taller visite a lo largo de su vida. Lo que sí
es local a cada organización es el **acceso**:

- `vehicle_access_grants` decide qué organización puede leer un vehículo
  (sección 5: "concede solo el acceso necesario").
- `vehicle_ownership_claims` es la relación cliente-local↔vehículo,
  siempre `provisional` en esta fase — ningún comando la verifica.
- `vehicle_ownerships` (intervalo verificado, cliente↔identidad global)
  existe en el schema pero ningún comando de esta fase escribe ahí.

Esto es lo que hace ciertas, a la vez, las dos reglas de sección 5:

- "una coincidencia no confirma propietario" — encontrar el mismo
  `vehicle_id` para un VIN ya conocido nunca crea ni implica ownership.
- "fusión de duplicados queda para Control" — tiene sentido porque el
  mismo vehículo puede ser legítimamente encontrado por más de una
  organización; no hay "el vehículo de DTEK" vs. "el vehículo de Taller
  Demo", solo accesos distintos al mismo registro.

## No enumeración

Ninguna política RLS de `vehicles`/`vehicle_identifiers` concede `SELECT`
sin que exista una fila de `vehicle_access_grants` no revocada para una
organización del actor. `select * from vehicles where id = '<uuid
adivinado>'` devuelve cero filas exista o no el vehículo — misma respuesta
para "no existe" y "existe pero esta organización no tiene acceso" (mismo
patrón que `neutralResourceNotAvailable`, `packages/auth`, R0-C sección
5.2). `customers` sigue el mismo principio con
`datatek_platform.actor_is_linked_customer`: `crm.read` por sí solo no
concede leer todo el CRM del tenant, solo la fila del cliente al que el
actor está verificadamente vinculado.

A nivel de aplicación, `packages/application/src/commands/non-enumeration.test.ts`
prueba exactamente esto contra el motor de fixtures, reutilizando los
fixtures de aislamiento DTEK Servicios / Taller Demo de R0-C
(`packages/application/src/fixtures/tenancy.ts`):

- un `vehicleId` real de DTEK, consultado desde Taller Demo, produce el
  mismo error `NOT_FOUND` neutral que un id inventado;
- registrar el VIN exacto de un vehículo ya conocido por DTEK desde Taller
  Demo enlaza al mismo `vehicle_id` (comportamiento documentado: "crea
  vehículo o solicitud de vínculo") sin que la respuesta contenga el
  `organization_id`, `actorId` o `customerId` de DTEK en ninguna forma.

## RegisterVehicle — flujo exacto

`packages/application/src/commands/vehicle-commands.ts` implementa el
flujo de la sección 5 paso a paso:

1. **Normaliza identificadores** — `normalizeVin`/`normalizePlate`
   (`packages/application/src/commands/normalize.ts`): mayúsculas, sin
   espacios/guiones, validación de forma.
2. **Busca de forma privada** — un único `find` sobre
   `state.vehicleIdentifiers`, sin exponer un endpoint de "existe este
   VIN" independiente.
3. **No revela coincidencias** — la forma del resultado
   (`RegisterVehicleOutput`) es idéntica exista o no coincidencia; el
   único campo que varía es `linkedToExistingVehicle` (uso interno/
   auditoría, nunca para copy de producto tipo "este VIN ya existía").
4. **Crea vehículo o solicitud de vínculo** — vehículo nuevo si no hay
   coincidencia; si la hay, reutiliza el `vehicle_id` existente y
   agrega cualquier identificador nuevo (p. ej. una placa que el
   vehículo no tenía) sin sobrescribir nada.
5. **Crea claim provisional local** — solo si se pasó un `customerId`.
6. **Concede solo el acceso necesario** — una fila de
   `vehicle_access_grants` con `scope: "read_own_case"`, nunca acceso
   universal.
7. **Audita** — un `AuditEventRecord` por invocación, en
   `state.auditLog` (equivalente en memoria del futuro `audit_events`
   de la ola `0085`, no implementada todavía).

## Odómetro: conflicto, nunca sobrescritura

`packages/domain/src/value-objects/odometer.ts` (`evaluateOdometerReading`)
decide `accepted` vs `conflict` comparando contra la última lectura
`accepted` de ese vehículo — sin importar qué organización la registró,
porque el odómetro es un hecho del vehículo físico, no de un tenant.
Conflictos reconocidos: `regression` (retrocedió), `implausible_jump` (más
de 1500 km/día sostenido) y `out_of_order_reading` (fecha retroactiva con
valor distinto). El comando `RecordOdometerEvent`
(`packages/application/src/commands/vehicle-commands.ts`) siempre agrega
una fila nueva — nunca actualiza ni borra la anterior, sea cual sea el
resultado. `vehicle_odometer_events` en `0030_vehicles_access.sql` refuerza
esto a nivel de schema: ninguna política/permiso de `UPDATE`/`DELETE`
existe para `authenticated`.

## Los comandos de Fase 1 + Fase 2 (CRM/vehículo/intake/caso/agenda)

Todos viven en `packages/application/src/commands/`, son funciones puras
`(state, ctx, input) -> CommandOutcome<T>` (no mutan `state`; devuelven un
`nextState` nuevo) y comparten el mismo `CommandContext`
(`context.ts`) — actor, organización, sucursal, capacidades efectivas de
R0-C (`OrganizationCapabilityResolution`, `@datatek/auth`), idempotency key
y correlation id:

| Comando | Archivo | Permiso requerido |
|---|---|---|
| `CreateProvisionalCustomer` | `crm-commands.ts` | `crm.manage` |
| `AddCustomerContact` | `crm-commands.ts` | `crm.manage` |
| `LinkCustomerAuthIdentity` | `crm-commands.ts` | `crm.manage` |
| `RegisterVehicle` | `vehicle-commands.ts` | `vehicle.manage` |
| `CreateVehicleOwnershipClaim` | `vehicle-commands.ts` | `vehicle.manage` |
| `RecordOdometerEvent` | `vehicle-commands.ts` | `vehicle.manage` |
| `CreateManualIntake` | `intake-commands.ts` | `intake.manage` |
| `AppendIntakeEntry` | `intake-commands.ts` | `intake.manage` |
| `InterpretReportedSymptom` | `intake-commands.ts` | `intake.manage` |
| `CreateCaseFromIntake` | `intake-commands.ts` | `intake.manage` |
| `AssignCaseParticipant` | `intake-commands.ts` | `intake.manage` |
| `TransitionCase` | `intake-commands.ts` | `intake.manage` |
| `AddCaseNote` | `intake-commands.ts` | `intake.manage` |
| `CreateTemporaryReservation` | `agenda-commands.ts` | `agenda.manage` |
| `ScheduleAppointment` | `agenda-commands.ts` | `agenda.manage` |
| `ConfirmAppointment` | `agenda-commands.ts` | `agenda.manage` |
| `CancelAppointment` | `agenda-commands.ts` | `agenda.manage` |
| `ReceiveVehicle` | `agenda-commands.ts` | `agenda.manage` |

Cada comando revisa primero un posible **replay de idempotencia** —
`state.idempotencyRecords`, indexado por `(organizationId, commandName,
idempotencyKey)` — antes de tocar cualquier permiso o dato, y devuelve el
resultado cacheado sin duplicar estado si la clave ya se usó para ese mismo
comando.

## Folio de caso: secuencial por organización

`CreateCaseFromIntake` (`intake-commands.ts`) consume
`consumeOrganizationCounter` (`state.ts`) con la clave `case_folio` — el
mismo patrón atómico "lee el valor actual, agrega uno" que
`datatek_platform.next_organization_counter` implementa en SQL
(`0050_intake_cases.sql`). El folio es **por organización**, nunca global:
dos casos creados en la misma organización reciben `folioNumber` 1 y 2
consecutivos; un caso creado en otra organización, en paralelo, tiene su
propio contador independiente empezando también en 1.
`folioCode` es una presentación fijada al crear (`"2026-00001"`, año +
folio con cero a la izquierda) — nunca depende de un slug que pueda
cambiar. Prueba: `intake-commands.test.ts`, `"assigns a sequential folio
per organization across two simultaneous cases"`.

## Transiciones de caso — tabla literal de R0-A sección 5.1

`packages/domain/src/case/case-transitions.ts` (`resolveCaseTransition`)
modela la tabla de sección 5.1 como un mapa de adyacencia por estado
origen, más la regla especial de `cancelled` (alcanzable desde cualquier
estado no terminal). Cuatro comandos llaman a esta función, cada uno
validando exactamente el edge que le corresponde antes de mutar cualquier
estado:

- `TransitionCase` — genérico, valida cualquier edge que el caller pida
  (`new`→`triage`, `triage`→`waiting_customer`/`scheduled`,
  `waiting_customer`→`triage`, `waiting_authorization`→`ready`/`closed`,
  `cancelled` desde cualquier estado no terminal).
- `ReceiveVehicle` (`agenda-commands.ts`) — exige `scheduled`→`received`.
- `StartInspection` (`inspection-commands.ts`, ver `brakes-slice.md`) —
  exige `received`→`inspection`.
- `CompleteInspection` (`inspection-commands.ts`) — exige
  `inspection`→`waiting_authorization`.

`ScheduleAppointment` deliberadamente **no** llama a
`resolveCaseTransition` — agendar reserva tiempo, no mueve el caso a
`scheduled` por sí solo; ese paso es responsabilidad explícita de
`TransitionCase`, llamado por separado. Una transición rechazada nunca
muta `state` — el comando devuelve `{ ok: false, error }` sin tocar
`cases`/`caseStatusEvents`. Prueba: `intake-commands.test.ts`, `"rejects
an edge that skips steps and never mutates state"`.

## Agenda: no doble reserva

`resource_reservations` en `0060_scheduling.sql` usa un `EXCLUDE USING
gist` sobre `[starts_at, ends_at)` por `resource_id`, excluyendo filas
`released` — la garantía real de "no doble reserva" una vez Postgres esté
alcanzable. `packages/application/src/commands/agenda-commands.ts`
(`overlapsActiveReservation`) replica la MISMA regla en TypeScript para el
motor en memoria: `ScheduleAppointment` y `CreateTemporaryReservation`
comprueban solapamiento contra toda reserva `hold`/`active` del mismo
recurso ANTES de crear nada — un solapamiento produce un error de dominio
`CONFLICT`, nunca una segunda reserva silenciosa. `CancelAppointment`
libera (`status: released`) todas las reservas de la cita cancelada,
liberando el recurso para una reserva posterior en el mismo rango. Prueba:
`agenda-commands.test.ts`, `"rejects a second reservation that overlaps
the first with a domain CONFLICT error, never creating it silently"` y
`"frees the resource once the colliding appointment is cancelled"`.

`ReceiveVehicle` registra llegada + odómetro y mueve el caso a `received`
— nunca marca trabajo iniciado (sección 8).

## Motor de fixtures en memoria

`packages/application/src/commands/engine.ts` (`createCommandEngine`)
envuelve todas las funciones puras (Fase 1 + Fase 2) con un `state`
mutable único — "functional core, imperative shell".
`apps/web/src/lib/commands-engine.ts` instancia exactamente un engine a
nivel de módulo, sembrado con `buildFixtureCrmVehicleState()`
(`commands/fixtures.ts` — un cliente y un vehículo por organización
semilla, mismos ids que `packages/application/src/fixtures/tenancy.ts`).
Ese módulo sobrevive mientras dure el proceso de `pnpm dev` — no hay
Postgres real detrás todavía.

`apps/web/src/app/api/dev/commands/route.ts` es una **ruta temporal de
desarrollo** (documentada como tal en el propio archivo, deshabilitada
fuera de `NODE_ENV=development`) que expone todos los comandos por HTTP
para poder ejercerlos de extremo a extremo sin UI todavía. Validación de
forma en el borde HTTP vive en `schemas.ts` de esa misma carpeta (zod); la
validación de dominio real sigue viviendo en los comandos. Esta ruta se
reemplaza en una fase posterior por la UI real de Pro llamando a los
mismos comandos desde un server action/loader.

## Pendiente

- Ejecutar `0020`–`0060` contra Postgres real y correr las pruebas pgTAP
  correspondientes en `supabase/tests/` — comandos exactos en la cabecera
  de cada migración.
- Verificar una cuenta (`vehicle_ownerships`) — ningún comando lo hace; el
  claim queda `provisional` siempre.
- `case_blockers`, `resource_schedules`, `capacity_blocks` — tablas con
  RLS completa desde ya pero sin comando de aplicación todavía (mismo
  patrón que `vehicle_ownerships` en 0030 Fase 1). Reconciliación completa,
  tabla por tabla (cómo se crea cada una en R0, quién la escribiría, y por
  qué no tiene comando todavía) en `docs/domain/unwritten-tables.md`.
- `0085`–`0087` (trabajo/calidad/finanzas) — fases posteriores de este
  mismo plan; ver `DATATEK_R0_D_VERIFICATION.md` para el detalle de qué
  falta exactamente para Fase 4.
- Inspección de frenos y evidencia — documentadas por separado en
  `docs/domain/brakes-slice.md` y `docs/domain/evidence.md`.
- Quote y autorización — documentados por separado en
  `docs/adr/0003-quote-versioning.md` y
  `docs/domain/authorization-security.md`.
