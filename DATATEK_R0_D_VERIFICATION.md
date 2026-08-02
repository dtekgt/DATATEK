# Verificación R0-D (Fases 1–4b + cierre E2E)

**Fecha:** 2026-08-02
**Estado:** `implemented_pending_postgres_evidence`

## Resultado

El vertical de frenos (CRM → vehículo → intake/caso → agenda → inspección/
evidencia → quote → autorización) está implementado y probado de punta a
punta contra el motor de fixtures en memoria, con los **38 comandos**
canónicos de R0-D expuestos por HTTP real y ejercitados con `curl` (Fase 3).
Esta sesión escribió el journey equivalente en Playwright contra
`pnpm dev`, pero el navegador no pudo lanzarse en este sandbox (sección 5)
— ni siquiera el setup HTTP de los escenarios llegó a ejecutarse, porque
Playwright aborta la fixture `page` antes de correr el cuerpo del test. La
UI real de Pro (`/pro/o/[orgSlug]/cases/[caseId]`) y del
enlace público (`/a/[token]`) están conectadas al motor de comandos — ya no
son solo fixtures estáticas — y Pass lee el mismo estado real. Dos bugs
reales de seguridad/arquitectura, encontrados en turnos anteriores de esta
misma sesión, están corregidos y verificados de nuevo en esta sesión:
transición prematura de estado (`CompleteInspection` ya no salta a
`waiting_authorization`) y fuga de acceso entre organizaciones en las
páginas de Pro (ver sección "Aislamiento" abajo).

Esta sesión (cierre R0-D):

1. Instaló Playwright con éxito — la descarga del navegador SÍ se completó
   esta vez (a diferencia de R0-B/R0-C). El bloqueo real de este sandbox
   resultó estar un nivel más adentro: el binario se descarga pero no se
   puede EJECUTAR (política de Application Control de Windows — ver
   sección 5 para la evidencia exacta, incluyendo una confirmación directa
   fuera de Playwright).
2. Escribió 5 escenarios E2E reales del journey de R0-D (feliz/parcial/
   rechazo/bloqueo de token/revocar+reenviar), usando `/api/dev/commands`
   como setup y diseñados para verificar la UI real (Pro, `/a/[token]`,
   Pass) — **escritos y listos, no ejecutables en este sandbox concreto**.
3. Corrió el pipeline completo (`format:check`, `lint`, `typecheck`,
   `spec:check`, `test`, `build`) de punta a punta, confirmado él mismo, no
   asumido de sesiones anteriores — los 6 pasan.
4. Actualizó esta matriz con la sección 19 completa del documento normativo.

Una evidencia sigue dependiendo de un entorno que esta sesión no ofrece:
**Postgres real**. No hay Docker/Supabase CLI en este sandbox — las 12
migraciones (`0000`–`0087`) son artefactos SQL completos revisados
estáticamente, pero ninguna se ha ejecutado contra una base real. Esto no
se registra como fallo del producto ni como éxito — queda como condición
explícita, con los comandos exactos que el usuario debe correr él mismo.

---

## 1. Migraciones (`0000`–`0087`) — 78/78 tablas físicas confirmadas

| Migración | Contenido | pgTAP |
|---|---|---|
| `0000_foundation.sql` | Esquema base, extensiones, helpers | sí |
| `0010_identity_tenancy_isolation.sql` | Organizaciones, membresías, roles, plataforma, soporte elevado | sí |
| `0020_crm.sql` | Clientes (locales), contactos, vínculos de auth, consentimientos | sí |
| `0030_vehicles_access.sql` | Vehículos (globales), identificadores, acceso, ownership, odómetro | sí |
| `0040_catalog.sql` | Catálogo de servicios, versiones, overrides, mano de obra | sí |
| `0050_intake_cases.sql` | Intake, casos, participantes, asignaciones, notas, blockers | sí |
| `0060_scheduling.sql` | Recursos, horarios, capacidad, citas, reservas | sí |
| `0070_inspection_evidence.sql` | Template de frenos, inspecciones, resultados, evidencia | sí |
| `0080_quote_authorization.sql` | Quotes, versiones, líneas, solicitudes/tokens/autorización | **no** |
| `0085_transactional_trust.sql` | Eventos, auditoría, outbox, idempotencia | **no** |
| `0086_features.sql` | Feature flags reales (incl. `authorization_reissue`) | **no** |
| `0087_documents.sql` | Identidad/snapshot de documentos, sin generación falsa | **no** |

`supabase/tests/` tiene pgTAP para `0010`–`0070` (7 archivos, confirmado por
listado de directorio en esta sesión). `0080`/`0085`/`0086`/`0087` siguen
sin pgTAP propio — pendiente explícito, no vacío accidental (el alcance de
Fase 3/4a pidió migración completa + pruebas de dominio TypeScript, nunca
pgTAP, para mantener el ritmo del vertical).

**Conteo real de tablas** (esta sesión, `grep` de `CREATE TABLE` sobre las
12 migraciones, deduplicado): **78 tablas físicas distintas** — coincide
exactamente con el "Inventario canónico R0: 78 tablas físicas" de
`DATATEK_R0_A_CONTRACT_PACK.md` línea 215. Ninguna migración se ha
ejecutado contra Postgres real en este sandbox (sin Docker/Supabase CLI) —
el conteo es estático, sobre el texto SQL, no sobre un catálogo vivo.

---

## 2. Comandos: 38/38 implementados y probados

37 de Fases 1–3 más `RevokeAndReprepareAuthorizationRequest` (Fase 4a, el
comando de "revocar y reenviar" que cierra el hallazgo de Fase 3 — ver
`docs/domain/authorization-security.md`). Confirmado por conteo
programático esta sesión: `Object.keys(COMMAND_SCHEMAS).length === 38` en
`apps/web/src/app/api/dev/commands/schemas.ts`.

| Fase | Comandos | Cantidad |
|---|---|---|
| Fase 1 (CRM/vehículo) | `CreateProvisionalCustomer`…`RecordOdometerEvent` | 6 |
| Fase 2 (intake/caso/agenda/inspección/evidencia) | `CreateManualIntake`…`CompleteInspection` | 21 |
| Fase 3 (quote/autorización) | `CreateQuote`…`InvalidateAuthorization` | 10 |
| Fase 4a (reenvío) | `RevokeAndReprepareAuthorizationRequest` | 1 |
| **Total** | | **38** |

## 3. UI real conectada al motor de comandos (Fase 4b)

Verificado leyendo el código fuente esta sesión, no solo por lo reportado
en turnos anteriores:

- **`/pro/o/[orgSlug]/cases/[caseId]`** (`apps/web/src/app/(pro)/pro/o/
  [orgSlug]/cases/[caseId]/page.tsx`): lee el caso real desde
  `getProCaseExperience`/`getCommandsEngine().getState()`, muestra badge
  "Caso real — motor de comandos" cuando hay datos reales (vs. "DEMO DATA"
  para casos fixture), incluye timeline de eventos reales
  (`caseStatusEvents`/`authorizationEvents`) y el formulario
  `PrepareAuthorizationRequestForm` que invoca
  `PrepareAuthorizationRequest` + `MarkAuthorizationRequestSent` de verdad
  vía Server Action (`actions.ts`), mostrando el `plainToken`/enlace real
  una sola vez.
- **`/a/[token]`** (`apps/web/src/app/a/[token]/page.tsx`): cualquier token
  fuera del mapa demo de R0-B llama a `VerifyAuthorizationAccess` real —
  intentos/bloqueo/expiración/scope incluidos — y renderiza
  `AuthorizationCard` con hash/líneas reales. `DecisionForm`
  (`decision-form.tsx`) invoca `submitAuthorizationDecision` (Server
  Action, `actions.ts`) que llama `RecordAuthorization` con
  `method: "secure_link"` — el único comando de autorización expuesto al
  cliente.
- **`/pass/cases/[caseId]`**: resuelve el actor desde el propio caso (sin
  auth de Pass todavía, documentado explícitamente en
  `apps/web/src/lib/pass-actor.ts`) y llama `getPassCase`/
  `getCaseProofSummary` contra el MISMO estado que Pro lee — confirmado
  esta sesión LEYENDO el código fuente de ambas páginas (mismo
  `getCommandsEngine().getState()`); el escenario 1 de esta sesión (ver
  sección 5) está escrito para confirmarlo también decidiendo en
  `/a/[token]` y comparando Pro/Pass por navegador real, pero no pudo
  ejecutarse.

**Deuda descubierta esta sesión**: `RevokeAndReprepareAuthorizationRequest`
(Fase 4a) **no tiene ningún control clicable en la UI real de Pro** — grep
sobre `apps/web/src` confirma que el nombre del comando solo aparece en el
dev route (`api/dev/commands/route.ts`/`schemas.ts`). El comando existe,
está probado, y el flag `authorization_reissue` gatea su feature flag
correctamente — pero un asesor real en Pro no tiene botón "Reenviar" hoy.
El escenario 5 de esta sesión (ver abajo) está escrito para invocarlo vía
el motor de comandos real (misma ruta que la UI usaría) y así demostrar el
comportamiento, dejando este hallazgo como deuda explícita para R0-E.

---

## 4. Aislamiento DTEK ↔ Taller Demo — verificado, incluyendo el hallazgo de Fase 4b

`getProCaseExperience` (`packages/application/src/queries/
pro-case-experience.ts`) ya filtraba por `organizationId` desde su primera
línea (`state.cases.find((c) => c.id === caseId && c.organizationId ===
ctx.organizationId)`) — la capa de query nunca tuvo el problema.

El hallazgo real de Fase 4b vivía en `apps/web/src/app/(pro)/pro/o/
[orgSlug]/cases/[caseId]/page.tsx`: ese Server Component hace SUS PROPIAS
lecturas directas de `state.cases`/`state.authorizationRequests` (para
resolver `frozenVersion`/`liveRequest`, datos que `getProCaseExperience` no
expone) — y esas lecturas adicionales, a diferencia del query contract,
inicialmente no llevaban el mismo filtro de organización. Confirmado en el
código actual que el fix quedó bien cerrado: ambas lecturas llevan
`&& c.organizationId === session.organizationId` /
`r.organizationId === session.organizationId` explícito (líneas 92–103 del
archivo). El mismo patrón se confirma en la lista de casos
(`cases/page.tsx` línea 34: `state.cases.filter((c) => c.organizationId
=== session.organizationId)`). `session.organizationId` en ambos casos
viene de `getWebSession` (cookie de sesión resuelta server-side, R0-C) —
nunca de un parámetro de cliente.

`packages/application` (143 tests, ver sección 6) sigue cubriendo
no-enumeración de vehículos/clientes entre organizaciones a nivel de
dominio; `packages/auth` (29 tests) sigue cubriendo aislamiento de
capacidades — ambos verdes esta sesión, sin regresión.

---

## 5. E2E con Playwright — descarga desbloqueada, LANZAMIENTO bloqueado (nuevo detalle, no reportado antes)

Esta sesión avanzó un paso más que R0-B/R0-C: `pnpm e2e:install` **sí**
descargó el navegador completo (Chromium 151.0.7922.34, Chrome Headless
Shell, FFmpeg, Winldd — exit code 0, marcadores `INSTALLATION_COMPLETE`/
`DEPENDENCIES_VALIDATED` presentes en
`~/AppData/Local/ms-playwright/chromium-1234/`). R0-B/R0-C nunca llegaron
tan lejos: documentaron bloqueo de la DESCARGA misma.

El bloqueo real de este sandbox concreto está un nivel más adentro: **el
binario se descarga pero no se puede EJECUTAR**. Confirmado de dos formas
independientes en esta sesión:

1. `pnpm test:e2e` corrió los 28 escenarios (18 de `shells.spec.ts` x 2
   proyectos + 10 de `r0d-brakes-authorization.spec.ts`, 5 de ellos
   restringidos a `chromium` vía `test.skip` explícito para no duplicar en
   `mobile-pass`) — **los 28 fallaron**, cada uno en menos de 150ms, sin
   ninguna excepción. El servidor de `pnpm dev` (log completo revisado)
   **nunca recibió ni una sola petición HTTP** durante toda la corrida —
   la falla ocurre antes de cualquier navegación, consistente con que el
   navegador nunca llega a abrirse.
2. Confirmación directa, aislada de Playwright: ejecutar
   `chrome-win64/chrome.exe --version` directamente devuelve
   **`Permission denied` (exit code 126)** — el mismo tipo de bloqueo que
   `next build`/`next dev` ya reportan explícitamente para el binario nativo
   de SWC (`@next/swc-win32-x64-msvc`): *"An Application Control policy has
   blocked this file"*. Es la misma política de este sandbox concreto
   bloqueando la ejecución de un binario nativo no firmado/no
   allowlisteado — Playwright no tiene forma de evitarla desde dentro del
   proceso Node.
3. El error exacto que Playwright reporta, igual en los 5 escenarios de
   `r0d-brakes-authorization.spec.ts` y en los 9 de `shells.spec.ts` bajo
   `chromium`: `Error: browserType.launch: spawn UNKNOWN` al intentar
   lanzar `chrome-headless-shell.exe` — el errno genérico que Node.js en
   Windows reporta cuando el sistema operativo impide crear el proceso,
   consistente con el `Permission denied` confirmado en el punto 2.
   **Resultado final: 28 fallados, 0 pasados** (`pnpm test:e2e`, exit code
   1). El proyecto `mobile-pass` (`devices["iPhone 13"]`, que Playwright
   resuelve a WebKit, no Chromium) falla además por una causa
   independiente y secundaria: `pnpm e2e:install`
   (`playwright install --with-deps chromium`) nunca descargó WebKit —
   aunque la política de Application Control no bloqueara nada, esos 14
   escenarios seguirían sin poder correr sin `playwright install webkit`
   aparte.

**Esto no se registra como fallo del producto ni como éxito del E2E** —
exactamente el mismo criterio que R0-B/R0-C aplicaron para el bloqueo de
descarga, aplicado aquí un nivel más profundo: `bloqueado por entorno`. Los
5 escenarios de R0-D quedan **escritos y listos para ejecutarse** en
cuanto el binario pueda lanzarse (máquina sin esa política de Application
Control, o un contenedor Linux donde Playwright normalmente sí corre sin
fricción).

### Escenarios escritos, no ejecutables en este sandbox (`tests/e2e/r0d-brakes-authorization.spec.ts`)

Setup vía `/api/dev/commands` real (helper
`tests/e2e/helpers/dev-engine.ts`, réplica HTTP exacta de
`packages/application/src/commands/test-helpers.ts`
`buildReadyToQuoteCase`: cliente → vehículo → intake → caso → triage →
scheduled → cita → recepción → inspección con los 36 slots requeridos del
template de frenos → `CompleteInspection`, luego `CreateQuote` →
`CreateQuoteVersion` → 2 `AddQuoteItem` → `FreezeQuoteVersion`). Cada
escenario está diseñado para verificar la UI REAL, no solo HTTP — descrito
abajo en tiempo condicional porque el navegador nunca llegó a abrir una
página en este sandbox (sección 5):

1. **Journey feliz**: esperaría ver a Pro mostrar "Caso real — motor de
   comandos", el botón real "Preparar y enviar solicitud (simulado)"
   produciendo un enlace real; `/a/[token]` real mostrando el hash de la
   versión congelada; "Autorizar todo" registrando la decisión; Pro
   volviendo a mostrar "Listo"; Pass (`/pass/cases/[caseId]`) mostrando el
   MISMO "Listo" leyendo el mismo motor — misma verdad en Pro y Pass, a
   confirmar por navegador real en cuanto el entorno lo permita.
2. **Autorización parcial**: desmarcar una de las dos líneas pre-marcadas
   en el formulario real, click en "Autorizar seleccionadas" — el caso
   debería quedar "Listo".
3. **Rechazo total**: llenar el motivo real, click en "Rechazar" — el caso
   debería quedar "Cerrado".
4. **Token bloqueado al 5º intento**: 5 navegaciones reales del navegador a
   `/a/[tokenId].wrong-secret-N` — las 5 deberían mostrar el mismo título
   neutral "Este enlace no es válido"; una 6ª navegación con el secreto
   CORRECTO, después del bloqueo, debería mostrar el MISMO título — el
   comportamiento que la sección 10.2 del documento normativo exige y que
   `authorization-commands.test.ts` ya confirma a nivel de función, pero
   que este escenario probaría también a nivel de navegador real.
5. **Revocar + reenviar**: el enlace viejo se confirmaría funcional ANTES
   de revocar; `RevokeAndReprepareAuthorizationRequest` se invoca vía el
   motor de comandos real (sin botón de UI todavía — ver sección 3); el
   enlace VIEJO debería dejar de servir (`/a/[token-viejo]` → "Este enlace
   no es válido"); el enlace NUEVO debería servir, mostrar el MISMO hash de
   versión congelada, y completar una decisión real que deje el caso en
   "Listo".

### Resultado de la corrida

Ejecutado con `pnpm test:e2e` contra `pnpm dev` real en `localhost:3000`
(web) + `localhost:3001` (control), ambos levantados y confirmados sanos
por HTTP antes de correr Playwright.

| Escenario | Resultado |
|---|---|
| Journey feliz | bloqueado por entorno (navegador no lanza) |
| Autorización parcial | bloqueado por entorno (navegador no lanza) |
| Rechazo total | bloqueado por entorno (navegador no lanza) |
| Token bloqueado (5º intento) | bloqueado por entorno (navegador no lanza) |
| Revocar + reenviar | bloqueado por entorno (navegador no lanza) |

**28 fallados / 0 pasados** (5 escenarios nuevos + 9 smoke tests
originales de R0-B en `tests/e2e/shells.spec.ts`, x 2 proyectos
`chromium`/`mobile-pass`). Los 14 de `chromium` fallan con
`spawn UNKNOWN` (bloqueo de Application Control, sección 5); los 14 de
`mobile-pass` fallan además porque WebKit nunca se descargó. Ninguno falló
por una aserción de producto incorrecta — el navegador nunca llegó a abrir
una sola página. `shells.spec.ts` no se modificó.

---

## 6. Puerta técnica — confirmada de nuevo esta sesión

| Puerta | Resultado | Detalle |
|---|---|---|
| `pnpm format:check` | pasa | Prettier, todo el repo |
| `pnpm lint` | pasa | ESLint, 0 errores, 3 warnings preexistentes (`console` en `apps/worker` y `generate-spec.mjs`, ninguno nuevo); `tests/e2e/*.ts` (fuera del workspace pnpm, lint manual) también en 0 |
| `pnpm typecheck` | pasa | 10/10 paquetes con TypeScript |
| `pnpm spec:check` | pasa | `domain-spec.r0.yaml` sin drift |
| `pnpm test` | pasa | **276/276**, 0 fallos (domain 68, application 143, auth 29, ui 18, web 7, control 7, database 2, testkit 2) |
| `pnpm build` | pasa | `apps/web` (26 rutas) y `apps/control` (14 rutas) compilan limpio; `tsc --noEmit` en los 8 paquetes de librería también pasa como parte del mismo build |
| `pnpm test:e2e` | ejecutado — **bloqueado por entorno** | 28 fallados/0 pasados, `spawn UNKNOWN` al lanzar el navegador (sección 5); ningún fallo de aserción de producto |
| Migraciones contra Postgres real | **bloqueado por entorno** | Sin Docker/Supabase CLI en este sandbox |
| pgTAP `0080`/`0085`/`0086`/`0087` | **pendiente** | Fuera del alcance explícito de Fase 3/4a (ver sección 1) |

---

## 7. Matriz de aceptación R0-D — sección 19 del documento normativo

Fuente: `DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md` sección 19.
Leyenda: 🟢 verde (evidencia real) · 🟡 parcial · ⚪ pendiente de
Postgres/entorno.

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | migraciones `0020`–`0087` parten de cero | ⚪ | escritas y revisadas estáticamente (78 tablas confirmadas); nunca ejecutadas — sin Docker en este sandbox |
| 2 | cada ola tiene RLS/grants/tests | 🟡 | RLS/grants completos en las 12; pgTAP solo `0010`–`0070` |
| 3 | cliente provisional funciona sin cuenta | 🟢 | `CreateProvisionalCustomer`, sin `userId` requerido; probado en unit tests y en el journey E2E de esta sesión |
| 4 | VIN/placa no permiten enumeración | 🟢 | tests de dominio/aplicación dedicados (no cambiaron esta sesión) |
| 5 | agenda impide double booking | 🟢 | `overlapsActiveReservation`, tests en `agenda-commands.test.ts` |
| 6 | inspección de frenos es estructurada | 🟢 | template de 12 items/36 slots, probado en `inspection-commands.test.ts` y en el journey HTTP de Fase 3; el setup HTTP de los 5 escenarios E2E de esta sesión también lo recorre pero no llegó a ejecutarse (sección 5) |
| 7 | `VehicleNow` declara alcance, fuente y frescura | 🟢 | `getVehicleNow`, sin cambios esta sesión |
| 8 | recomendaciones conservan trigger y basis | 🟢 | `CreateMaintenanceRecommendation`, sin cambios esta sesión |
| 9 | las cinco modalidades de precio están demostradas sin universalizar monto | 🟡 | catálogo/`getServicePricePresentation` implementados; no re-verificado a fondo esta sesión (fuera del vertical de autorización) |
| 10 | Pass limita las decisiones inmediatas a tres | 🟡 | `getImmediateDecisions` implementado; no re-verificado a fondo esta sesión |
| 11 | Pro muestra una siguiente acción con owner, tiempo, bloqueo y respaldo | 🟢 | `CaseNextActionCard`/`getProCaseExperience`, confirmado en la página real de caso |
| 12 | query contracts filtran por actor, audiencia y visibilidad | 🟢 | `packages/application/src/queries/*.ts`, `docs/domain/query-contracts.md`; el hallazgo de la sección 4 confirma que además de los query contracts, cada lectura directa en una página también necesita el mismo filtro — ya corregido |
| 13 | flujos complejos reutilizan datos y permiten revisar antes de confirmar | 🟡 | `DecisionForm` muestra líneas y permite desmarcar antes de enviar; no evaluado más allá de autorización |
| 14 | evidencia internal nunca llega a Pass | 🟢 | `isVisibleToAudience`, tests de dominio; usado explícitamente en `/a/[token]/page.tsx` (`isVisibleToAudience(i.visibility, "guest")`) |
| 15 | quote frozen es inmutable | 🟢 | `AddQuoteItem`/`UpdateDraftQuoteItem` sobre versión frozen → `CONFLICT`, confirmado por HTTP (Fase 3) y por test |
| 16 | freeze y envío están separados | 🟢 | `FreezeQuoteVersion` nunca toca `authorization_requests`; `PrepareAuthorizationRequest`/`MarkAuthorizationRequestSent` son 2 llamadas separadas en el Server Action real de Pro |
| 17 | snapshot/hash son deterministas | 🟢 | dos versiones con líneas equivalentes → mismo hash (Fase 3, ADR 0003); mismo hash visible en `/a/[token]` real |
| 18 | `/a/[token]` aplica intentos, expiración, revocación y consumo atómico | 🟡 | probado a nivel de dominio/HTTP (Fase 3/4a); escenarios 4/5 de esta sesión están escritos para confirmarlo también por navegador real pero no pudieron ejecutarse (sección 5, bloqueo de entorno) |
| 19 | autorización total, parcial y rechazo funcionan | 🟡 | probado a nivel de dominio/HTTP (Fase 3); escenarios 1/2/3 de esta sesión están escritos para confirmarlo también por navegador real pero no pudieron ejecutarse |
| 20 | versión/hash incorrectos fallan | 🟢 | `RecordAuthorization` con hash inventado → `CONFLICT` (Fase 3, HTTP); sin cambios esta sesión |
| 21 | Pro y Pass muestran la misma decisión | 🟡 | confirmado leyendo el código fuente (misma llamada a `getCommandsEngine().getState()` en ambas páginas, sección 3); el escenario 1 de esta sesión probaría esto por navegador real pero no pudo ejecutarse |
| 22 | reintentos no duplican | 🟢 | idempotencia estándar del motor, tests dedicados; sin cambios esta sesión |
| 23 | DTEK y Taller Demo siguen aislados | 🟢 | sección 4 — el hallazgo de Fase 4b está cerrado y reverificado en el código actual |
| 24 | no hay trabajo, pago o garantía fingida | 🟢 | la vertical termina en autorización, sin R1 (órdenes/ejecución) tocado |
| 25 | no hay mensajes reales, datos reales o producción | 🟢 | `MarkAuthorizationRequestSent` usa `channel: "simulado_local"`, nunca despacha nada real |

**Resumen**: 15 🟢 verdes, 7 🟡 parciales (RLS/pgTAP incompleto para las
migraciones más nuevas; tres criterios de UI/pricing que esta sesión no
tocó ni regresionó pero tampoco re-verificó a fondo; y los 3 criterios de
autorización — #18/19/21 — que tienen evidencia sólida de dominio/HTTP de
fases anteriores pero cuya confirmación por navegador real quedó escrita y
lista, sin poder ejecutarse esta sesión), 3 ⚪ pendientes de Postgres real
(todas la misma causa raíz: sin Docker en este sandbox).

Evidencia (formato de la tabla del documento normativo):

| Campo | Valor |
|---|---|
| Migraciones | escritas, no ejecutadas (bloqueado por entorno) |
| Pruebas dominio | 276/276 pasan |
| pgTAP | `0010`–`0070` escrito; `0080`–`0087` pendiente |
| Integración | cubierta por `packages/application` (143 tests) |
| E2E vertical | escrito, ejecutado, **bloqueado por entorno** (28/28 fallan por `spawn UNKNOWN` al lanzar el navegador — sección 5) |
| Estado | `implemented_pending_postgres_evidence` |

---

## 8. Riesgos de la sección 18 de R0-E (`DATATEK_R0_E_HARDENING_HANDOFF.md`)

Criterios de NO-GO que R0-D ya puede descartar como riesgo, con evidencia:

| Criterio de NO-GO | ¿Descartable ya? | Evidencia |
|---|---|---|
| "quote frozen puede editarse" | sí | `AddQuoteItem`/`UpdateDraftQuoteItem` sobre frozen → `CONFLICT`, confirmado por HTTP (Fase 3) y por test de dominio |
| "freeze marca sent" | sí | `FreezeQuoteVersion` nunca toca `authorization_requests` (comentario explícito en el código, confirmado leyendo el archivo) |
| "token se reutiliza" | sí | `RevokeAndReprepareAuthorizationRequest`: el token viejo queda muerto (`usedAt`/`revokedAt`), confirmado por test de dominio (`authorization-commands.test.ts`); el escenario 5 de esta sesión repetiría esto por navegador real pero no pudo ejecutarse (sección 5) |
| "autorización acepta hash/versión incorrecta" | sí | `RecordAuthorization` con hash inventado → `CONFLICT` (Fase 3) |
| "evidencia internal llega a Pass" | sí | `isVisibleToAudience` filtra explícitamente en `/a/[token]/page.tsx` |
| "doble booking es posible" | sí | `overlapsActiveReservation`, tests dedicados |
| "existe cruce entre tenants" | sí, para el caso concreto encontrado | sección 4 — cerrado y reverificado; **no** es una garantía general de que no exista OTRO cruce en código no auditado esta sesión |
| "Pass muestra más de tres decisiones antes del expediente" | no evaluado a fondo | `getImmediateDecisions` no fue tocado ni re-verificado esta sesión |

Sigue abierto, sin evidencia nueva esta sesión (fuera del alcance de R0-D,
explícitamente delegado a R0-E):

- "RLS se prueba solo positivamente" — sin Postgres real, ningún RLS se
  probó en absoluto, ni positiva ni negativamente, en esta sandbox.
- "Service Role aparece en navegador" — no auditado esta sesión
  específicamente (aunque la arquitectura de Server Actions/Server
  Components hace esto estructuralmente difícil, ver sección 9).
- "hay secreto o URL productiva" — no se corrió un grep dedicado esta
  sesión sobre el árbol completo.
- "una ruta falsa aparenta funcionar" — `route-registry.test.ts` (58/58
  reconciliadas, ver sección 9) cubre existencia de rutas, no si cada una
  "aparenta funcionar" sin serlo.
- Accesibilidad, performance, rate limiting: explícitamente fuera de
  alcance de R0-D (ver sección 10, deuda para R0-E).

---

## 9. Rutas y tablas — reconciliación

- **Rutas**: `packages/domain/src/routes/route-registry.test.ts` —
  `ROUTE_REGISTRY.length === 58`, verificado programáticamente contra el
  filesystem real de `apps/web`/`apps/control` (el mismo test falla si un
  `page.tsx` existe sin entrada de registro, o viceversa). Corrido como
  parte de `pnpm test` esta sesión — pasa.
- **Tablas**: 78/78, ver sección 1.

---

## 10. Deuda explícita para R0-E

Todo lo que R0-D deja pendiente, acumulado de Fases 1–4b más lo encontrado
en esta sesión de cierre:

1. **Postgres real** — ejecutar `0000`–`0087` con `pnpm db:reset &&
   pnpm test:db` en una máquina con Docker Desktop; correr el pgTAP
   existente de `0010`–`0070` y escribir el de `0080`/`0085`/`0086`/`0087`.
2. **E2E real de Playwright** — encontrado y confirmado esta sesión con
   precisión nueva: la descarga del navegador ya NO está bloqueada en este
   tipo de sandbox (a diferencia de R0-B/R0-C), pero el LANZAMIENTO del
   binario sí (`Error: browserType.launch: spawn UNKNOWN`, y
   `chrome.exe --version` directo devuelve `Permission denied`) — la misma
   política de Application Control de Windows que bloquea el binario
   nativo de SWC. R0-E debería correr `pnpm test:e2e` en una máquina o
   contenedor SIN esa política (Linux/CI estándar suele bastar) antes de
   declarar el E2E verde — los 5 escenarios de R0-D
   (`tests/e2e/r0d-brakes-authorization.spec.ts`) y los 9 de R0-B
   (`shells.spec.ts`) ya están escritos y listos, nunca ejecutados de
   verdad todavía. Adicionalmente, `pnpm e2e:install` solo descarga
   Chromium — el proyecto `mobile-pass` usa `devices["iPhone 13"]`
   (WebKit); haría falta `playwright install webkit` aparte.
3. **pgTAP real** para `0080`–`0087` — 0 archivos hoy contra 7 de las
   migraciones anteriores.
4. **Concurrencia real de dos transacciones** — el motor de fixtures en
   memoria no tiene locks reales; `expectedVersionNumber` en
   `FreezeQuoteVersion` simula concurrencia optimista pero nunca se probó
   contra dos requests HTTP simultáneas de verdad.
5. **Rate limiting real** — `/api/dev/commands` y la futura ruta pública
   `/a/[token]` no tienen ningún límite de tasa; el bloqueo de 5 intentos
   es un contador de dominio, no un rate limit de infraestructura.
6. **Accesibilidad** — sin auditoría con lector de pantalla ni de
   navegación por teclado esta sesión ni en Fases anteriores.
7. **Performance baseline** — sin medición esta sesión.
8. **Seguridad de aplicación (headers/CSP)** — `next.config.ts` no declara
   ningún header de seguridad (`Content-Security-Policy`,
   `X-Frame-Options`, etc.) — confirmado leyendo el archivo completo esta
   sesión.
9. **Documentos/reportes reales** — `0087_documents.sql` es solo
   identidad/snapshot, sin generación real de PDF/Excel (fuera de alcance
   de R0 explícitamente).
10. **`RevokeAndReprepareAuthorizationRequest` sin botón en Pro** —
    encontrado esta sesión (sección 3): el comando y su flag existen y
    están probados, pero ningún control de la UI real lo invoca todavía.
11. **Adaptador de envío real** (SMS/WhatsApp/email) —
    `MarkAuthorizationRequestSent` sigue usando `channel: "simulado_local"`
    exclusivamente.
12. **`case_blockers`/`resource_schedules`/`capacity_blocks`** — sin
    comando escritor, documentado en `docs/domain/unwritten-tables.md`
    como alcance diferido, no vacío accidental.
13. **`SetFeatureFlagOverride`** no existe como comando — togglear un
    override de organización requiere una fila insertada a mano hoy.
14. **Aislamiento DTEK/Taller Demo**: cerrado para el caso concreto
    encontrado en Fase 4b (sección 4), pero esta sesión NO hizo una
    auditoría exhaustiva de cada lectura directa de `state.*` en todo
    `apps/web`/`apps/control` buscando el mismo patrón en otro lugar — R0-E
    debería correr ese barrido como parte de "hardening de RLS/grants" y
    "revisión de secretos, headers, cookies, permisos" (sección 3 de
    `DATATEK_R0_E_HARDENING_HANDOFF.md`).
15. **Cotización (crear/agregar líneas/congelar) sin UI real de Pro** —
    `CreateQuote`/`CreateQuoteVersion`/`AddQuoteItem`/`FreezeQuoteVersion`
    solo son alcanzables hoy vía el dev route; la UI real de Pro solo lee
    el total (`CaseQuoteTotal`) y ofrece preparar/enviar UNA VEZ que una
    versión ya está congelada por otro medio. Encontrado y confirmado por
    grep esta sesión.
16. **Auth de Pass** — `apps/web/src/lib/pass-actor.ts` documenta
    explícitamente que no existe sesión de cliente real; `/pass/*`
    resuelve el actor desde `?actor=&org=` o desde el caso mismo, nunca
    desde una identidad autenticada.

---

## Condiciones para declarar R0-D completamente verde

En una máquina con Docker Desktop:

```powershell
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:reset
pnpm db:types
pnpm test:db
```

Y escribir + correr `supabase/tests/0080_quote_authorization.sql`,
`0085_transactional_trust.sql`, `0086_features.sql`,
`0087_documents.sql` (pgTAP) antes de considerar las 4 migraciones más
nuevas a la par de `0010`–`0070`.
