# Runbook — journey de quote/autorización por HTTP real (R0-D Fase 3)

Demuestra los 10 comandos de Fase 3 (`CreateQuote`, `CreateQuoteVersion`,
`AddQuoteItem`, `UpdateDraftQuoteItem`, `FreezeQuoteVersion`,
`PrepareAuthorizationRequest`, `MarkAuthorizationRequestSent`,
`VerifyAuthorizationAccess`, `RecordAuthorization`,
`InvalidateAuthorization`) contra `apps/web/src/app/api/dev/commands/route.ts`
con `curl` real sobre `pnpm dev` — no llamadas directas a las funciones de
comando como hacen los tests unitarios. Ejecutado y verificado en verde
(0 fallos inesperados) el 2026-08-02.

## Cómo correrlo

```powershell
pnpm dev   # deja el servidor de apps/web escuchando en :3000
```

En otra terminal, con `curl` disponible (Git Bash en Windows trae uno):

```bash
BASE="http://localhost:3000/api/dev/commands"
curl -s -X POST "$BASE" -H "Content-Type: application/json" -d '{
  "command": "CreateProvisionalCustomer",
  "orgSlug": "dtek-servicios",
  "actorId": "u-advisor-dtek",
  "idempotencyKey": "demo-customer-1",
  "input": { "displayName": "Cliente Demo", "source": "whatsapp_manual" }
}'
```

Cada request sigue la forma exacta que valida `requestSchema` en el route
handler: `command`, `orgSlug` (`dtek-servicios` | `taller-demo`), `actorId`
(un id de `packages/application/src/fixtures/tenancy.ts` —
`FIXTURE_ACTOR_IDS`), `idempotencyKey` (único por llamada real; repetirlo
con el MISMO comando reproduce la respuesta cacheada en vez de duplicar
estado), y `input` con la forma de cada comando (`schemas.ts`, la misma
carpeta). El endpoint responde HTTP 200 si `ok: true`, HTTP 422 si
`ok: false` con un `error.code`/`error.message` de dominio.

El script completo (bash + curl, ~35 pasos lógicos, encadena ids de
respuestas anteriores) fue construido durante esta verificación y no forma
parte del repositorio — se referencia aquí por su contenido, no por
ruta, porque vivió en un scratchpad de sesión. Reconstruirlo es directo
siguiendo la secuencia de esta página; la sección "Secuencia" abajo lista
cada llamada con su comando e input.

## Caso A — creación completa, autorización PARCIAL, bug de transición confirmado

1. `CreateProvisionalCustomer` (actor `u-advisor-dtek`) → `customerId`.
2. `RegisterVehicle` con un VIN válido (alfanumérico, **sin I/O/Q**,
   5–17 caracteres — `packages/application/src/commands/normalize.ts`;
   un VIN como `"VF9DEMO..."` falla porque contiene `O`) → `vehicleId`.
3. `CreateManualIntake` → `threadId`.
4. `CreateCaseFromIntake` → `caseId`, `folioCode` (`2026-000NN`,
   secuencial por organización).
5. `TransitionCase` → `triage`, luego → `scheduled`.
6. `ScheduleAppointment` (recurso semilla `res-dtek-bay-1`) → `appointmentId`.
7. `ReceiveVehicle` → caso pasa a `received`.
8. `StartInspection` (actor `u-inspector-dtek`) → caso pasa a `inspection`,
   `inspectionId`.
9. `RecordInspectionResult` × 32 (8 items `axle_side` × front/rear ×
   left/right) + `RecordMeasurement` × 16 (los 4 items que
   `requiresMeasurement: true` — `pad_thickness_inner/outer`,
   `disc_thickness_measured/minimum` — en cada uno de los 4 combos de
   eje/lado) + `RecordInspectionResult` × 4 (items `vehicle`-scope:
   `fluid_condition`, `parking_brake_condition`, `pedal_result`,
   `road_test_result`) = **36 slots requeridos**
   (`packages/domain/src/inspection/brakes-template.ts`,
   `brakesTemplateRequiredSlots()`).
10. `CompleteInspection` → **el caso queda en `inspection`**, NO en
    `waiting_authorization`. Este es el bug de Fase 2 que se corrigió: antes
    de esta corrección, `CompleteInspection` transicionaba el caso de forma
    prematura, antes de que existiera ninguna cotización. Confirmado
    explícitamente en esta corrida (`data.case.status === "inspection"`
    justo después de `CompleteInspection`).
11. `CreateQuote` → `quoteId`. `CreateQuoteVersion` (`currency: "GTQ"`) →
    `quoteVersionId`, `versionNumber: 1`, `status: "draft"`.
12. `AddQuoteItem` × 3 (pastillas, disco, mano de obra) — todas GTQ.
13. `UpdateDraftQuoteItem` sobre la línea de mano de obra (cambia
    `quantity`) — editable libremente porque la versión sigue `draft`.
14. `FreezeQuoteVersion` → `status: "frozen"`, `snapshotHash` (SHA-256),
    `frozenAt` no nulo, `totalMinor` recalculado desde las líneas
    (`Q1,265.00` en esta corrida).
15. **Determinismo real**: se creó una SEGUNDA `quote`/`quoteVersion` en el
    MISMO caso con líneas de contenido equivalente (mismo `caseId`,
    `currency`, líneas) y se congeló también. El hash resultante fue
    **idéntico** al del paso 14 pese a tener `quoteId`/`versionId`/
    `frozenAt` completamente distintos — confirma que el hash certifica
    contenido, no identidad de fila (`docs/adr/0003-quote-versioning.md`).
16. `AddQuoteItem` y `UpdateDraftQuoteItem` sobre la versión YA congelada →
    ambos fallan con `CONFLICT`: *"La versión 1 ya no es editable (estado:
    frozen). Crea una nueva versión."* — inmutabilidad confirmada por HTTP,
    no solo por test unitario.
17. `PrepareAuthorizationRequest` (`audienceCustomerId` = el `customerId`
    del paso 1) → **AQUÍ, y solo aquí, el caso pasa a
    `waiting_authorization`** (`data.case.status`). `request.status` queda
    en `prepared` (nunca `sent` todavía) — confirma que freeze/preparar/
    enviar son 3 eventos separados. Devuelve `plainToken` =
    `"<tokenId>.<secreto>"`.
18. `MarkAuthorizationRequestSent` → `request.status: "sent"` — evento
    separado del freeze y de la preparación (`sentAt`/`sentChannel`
    quedan poblados; `FreezeQuoteVersion` nunca los toca).
19. `VerifyAuthorizationAccess` con el `plainToken` correcto, actor
    `"guest-web-session"` (sin membresía de organización — un guest real) →
    éxito, `scope: "read_and_decide"`.
20. `VerifyAuthorizationAccess` con `"<mismo tokenId>.wrong-secret-attempt-N"`
    para N=1..5 → **las 5 devuelven exactamente el mismo par
    `(code, message)`**: `TOKEN_INVALID`, *"El enlace de autorización no es
    válido, expiró o ya no está disponible."* Al 5º intento el token queda
    bloqueado internamente (`lockedAt` fijado — no visible en la respuesta,
    que sigue siendo el mismo mensaje neutral).
21. `VerifyAuthorizationAccess` con el token CORRECTO, DESPUÉS del bloqueo →
    también falla, con el MISMO `(code, message)` exacto que los 5 intentos
    fallidos — el bloqueo es indistinguible de una adivinanza incorrecta,
    tal como exige la sección 10.2.
22. **Hallazgo real** (ver `docs/domain/authorization-security.md`, sección
    "Qué NO hace todavía"): con el token bloqueado, un segundo
    `PrepareAuthorizationRequest` sobre el MISMO caso (para obtener un
    token fresco) **falla** con `CONFLICT`: *"No existe una transición
    válida de 'waiting_authorization' a 'waiting_authorization'."* —
    porque el comando siempre re-ejecuta `TransitionCase` hacia
    `waiting_authorization`, y esa arista no es válida desde
    `waiting_authorization` mismo. La recuperación real demostrada es
    `RecordAuthorization` con `method: "staff_manual"` (actor
    `u-owner-dtek`, permiso `authorization.decide`) sobre el mismo
    `authorizationRequestId` — el request sigue `sent` aunque el token esté
    bloqueado.
23. `RecordAuthorization` (`method: "staff_manual"`, `decision: "partial"`,
    `acceptedQuoteItemIds`: solo pastillas + disco, rechaza mano de obra) →
    `authorization.status: "partially_accepted"`, **`case.status: "ready"`**.
24. Repetir la MISMA llamada con la MISMA `idempotencyKey` → `replayed:
    true`, mismo `authorizationId` — ninguna fila duplicada.

## Caso B — caso nuevo, rechazo TOTAL, invalidación

Mismo flujo 1–14 con datos nuevos (`VIN` distinto, textos distintos), sin
determinismo ni intentos fallidos. En el paso de decisión:

- `RecordAuthorization` (`method: "secure_link"`, actor
  `"guest-customer-b"`, sin cuenta, `decision: "reject"`) →
  `authorization.status: "rejected"`, **`case.status: "closed"`**.
- `InvalidateAuthorization` (actor `u-owner-dtek`) sobre esa autorización ya
  decidida → `status: "invalidated"`, `invalidatedReason` poblado — la
  decisión original sigue en el historial (`authorization_items` intactos),
  nunca se borra (sección 5.6, "append-only en espíritu").

## Caso C — guard de hash inventado

Caso mínimo (no requiere completar la inspección — `PrepareAuthorizationRequest`
solo exige versión `frozen` + caso `inspection`, no `CompleteInspection`)
llevado hasta `PrepareAuthorizationRequest` + `MarkAuthorizationRequestSent`.

- `RecordAuthorization` con `quoteVersionHash: "sha256-invented-does-not-match-anything"`
  → falla con `CONFLICT`: *"El hash enviado no coincide con la versión
  congelada vigente."* — nunca intenta adivinar a qué versión se refería.
- La misma llamada con el hash REAL (`quoteVersion.snapshotHash`) → éxito,
  `decision: "accept_all"` → `case.status: "ready"`.

## Resultado

35 pasos lógicos, 0 fallos inesperados en la corrida final (una corrida
inicial reveló un VIN inválido en el fixture de prueba — corregido en el
script, no en el producto — y confirmó empíricamente el hallazgo del punto
22 antes de escribir la corrida completa). Ver
`docs/domain/authorization-security.md` para el detalle del hallazgo 22 y
`docs/adr/0003-quote-versioning.md` para el detalle del determinismo de
hash del punto 15.
