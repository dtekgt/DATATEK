# R0-E Hardening — Fase 2 (worker/outbox + seguridad de aplicación + rate limits)

**Fecha:** 2026-08-03
**Estado:**

- **Parte A (worker de outbox)** — `verified_in_sandbox`. Código TypeScript
  real, 37 tests corridos con `node --test`, proceso ejecutado de verdad.
  La persistencia es en memoria: **no drena la tabla `outbox_messages` real**
  (sin Postgres en este entorno).
- **Parte B (seguridad de aplicación)** — `verified_in_browser` para las
  cabeceras (servidas por un build de producción real y comprobadas con
  `curl` y con un navegador); `verified_in_sandbox` para cookies y
  validación de Server Actions (tests + un login real ejecutado en
  navegador); `audited_only` para el enlace de autorización (auditoría con
  evidencia, sin reimplementación).
- **Parte C (rate limits)** — `contract_only`. Contrato y adapter local
  probados. **NO es rate limiting productivo y ninguna ruta lo aplica
  todavía.** Ver sección 6.

Esta sesión es la Fase 2 de 4 de R0-E. No toca observabilidad/rutas/
performance (Fase 3) ni E2E/accesibilidad/docs/reporte final (Fase 4).

---

## 0. Resultado real, en una tabla

| Entregable | Estado honesto |
|---|---|
| Worker de outbox con los 9 requisitos de sección 8 | Implementado y probado (37 tests) |
| Las 5 pruebas obligatorias de sección 8 | 5/5 verdes, con matices declarados en 1.3 |
| Cabeceras de seguridad en `apps/web` y `apps/control` | Implementadas y **verificadas por HTTP real**, no solo escritas |
| CSP que no rompe la app | Verificada en navegador: hidratación y navegación cliente funcionan, 0 errores de consola |
| Cookies (httpOnly/secure/sameSite/expiración/separación) | Auditadas y corregidas: faltaba **expiración** y faltaba **revocación** |
| Server Actions revalidados como endpoints públicos | 4 acciones endurecidas; **2 bugs reales corregidos** (ver 4.3) |
| Scan de secretos | Limpio. 2 observaciones, ninguna es una fuga |
| Auditoría del enlace de autorización (9 puntos) | 7 cumplen, 2 parciales — detalle y evidencia en sección 5 |
| Rate limits (6 políticas × 8 campos) | Definidas y probadas; **sin cablear, no productivo** |
| Pipeline completo | 6/6 verde. Tests **305 → 371 (+66)** |

**Bugs reales encontrados y corregidos en esta fase: 3.** Dos en Server
Actions (4.3) y uno propio, en mi orden de redacción de errores (1.4).

---

## 1. Parte A — Worker de outbox (sección 8)

### 1.1 Punto de partida

`apps/worker/src/index.mjs` era un placeholder de 13 líneas que imprimía una
línea y salía. No existía **ninguna** representación TypeScript del outbox:
la tabla `outbox_messages` estaba en `0085_transactional_trust.sql` y nada
más (verificado: `grep -rn "outbox" packages/ apps/` devolvía cero
resultados fuera del SQL).

### 1.2 Qué se implementó, y contra qué schema

Archivos nuevos, todos en `C:\Users\Dominic\Documents\Datatek gt\app\apps\worker\src\`:

| Archivo | Contenido |
|---|---|
| `outbox/types.ts` | Modelo de fila + **contrato `OutboxRepository`** |
| `outbox/memory-repository.ts` | Única implementación de R0 (en memoria) |
| `outbox/sanitize.ts` | Sanitización de error + política de backoff |
| `outbox/handlers.ts` | Los 2 handlers permitidos en R0 + sumideros idempotentes |
| `outbox/worker.ts` | `OutboxWorker`: ciclo, claim, estados terminales, health |
| `outbox/worker.test.ts` | 24 tests |
| `outbox/sanitize.test.ts` | 13 tests |
| `outbox/test-helpers.ts` | Fixtures sintéticas, sin PII |
| `index.ts` | Host del proceso (reemplaza `index.mjs`, eliminado) |

`0085` **no se modificó**. El modelo TypeScript se adaptó al schema
existente, columna por columna; la tabla de correspondencia está en la
cabecera de `types.ts`. Un detalle que obligó a una decisión real:
`correlation_id`/`causation_id` **no son columnas de `outbox_messages`** —
viven en `domain_events`, al que la tabla apunta con FK compuesta. En vez de
inventar columnas, el worker los lee del evento enlazado (`ClaimedOutboxMessage`),
que es exactamente lo que hará un `JOIN` en Postgres.

Los 9 requisitos de la sección 8:

| Requisito | Dónde |
|---|---|
| claim con lock/lease | `claimBatch` — sección crítica síncrona; en Postgres, `for update skip locked` |
| procesamiento idempotente | dedupe por `(organizationId, idempotencyKey)`, el mismo par del `unique` de `0085` |
| heartbeat/health | `runCycle` late al cerrar ciclo; `health()` declara `unknown` si nunca latió |
| intentos | `attempts` se incrementa **en el claim**, no al fallar |
| backoff | `computeBackoffDelayMs`: exponencial `30 s → 15 min`, con techo |
| error sanitizado | `sanitizeOutboxError` antes de cualquier escritura |
| `next_attempt_at` | escrito en cada fallo recuperable |
| estado terminal/archive | `sent`/`dead` + `archived_at`, nunca re-reclamados |
| correlation/causation IDs | leídos del `domain_events` y propagados a efectos y logs |

**Decisión de diseño (la que el brief pedía documentar).** El contrato
`OutboxRepository` está escrito para que la implementación Postgres sea un
reemplazo directo, con la misma filosofía y vocabulario que
`apps/web/src/lib/commands-engine.ts` usa para el motor de comandos. La
cabecera de `types.ts` incluye **el SQL literal** que cada método ejecutará
(el `update ... where id in (select ... for update skip locked) returning *`
completo) y los 4 invariantes que cualquier implementación debe sostener.
El índice `outbox_messages_pending_idx (next_attempt_at) where status in
('pending','processing')` de `0085` ya sirve ese predicado exacto: **no hace
falta índice nuevo**.

Por qué el código vive en `apps/worker` y no en `packages/application`: hay
una razón de runtime concreta, no de gusto. Node 24 hace type-stripping
nativo de `.ts`, pero **no dentro de `node_modules/`** — y un workspace
package se resuelve por symlink ahí. Si el core viviera en
`packages/application`, `node src/index.ts` no podría importarlo sin un paso
de build. Manteniéndolo autocontenido, el worker corre sin compilar nada.

### 1.3 Las 5 pruebas obligatorias — resultado real

Corridas con `pnpm --filter @datatek/worker test` (`node --test`).
**37 tests, 37 pass, 0 fail.**

| # | Prueba (texto de la sección 8) | Mecanismo | Resultado |
|---|---|---|---|
| 1 | dos workers no procesan el mismo mensaje simultáneamente | 3 tests: `Promise.all` de dos ciclos; 5 claims concurrentes sobre 3 mensajes; segundo claim dentro del lease | ✅ Exactamente 1 reclama; los 3 ids se reparten sin repetirse; el efecto local se registra **1 sola vez**; `attempts = 1` |
| 2 | lease expirada permite recuperación | 2 tests: worker A reclama y "muere"; B intenta antes y después de vencer | ✅ Antes de vencer: 0 reclamados. Después: B lo recupera y lo cierra. `attempts = 2` — el intento del worker muerto **no se regala** |
| 3 | retry no duplica | 2 tests: handler que escribe su efecto y **luego** falla; y reproceso de un `sent` | ✅ Handler ejecutado 2 veces, **1 solo efecto persistido**. El reintento respeta el backoff (un ciclo inmediato reclama 0). `sent` nunca se re-reclama |
| 4 | poison message termina en estado visible | 3 tests: agotamiento de intentos; tipo sin handler; `PermanentOutboxError` | ✅ `status: dead`, `archived_at` puesto, `last_error` sanitizado, lease liberado. **No es loop silencioso**: un ciclo 10 000 s después reclama 0. Error permanente muere al 1.er intento, no consume 5 |
| 5 | fallo del worker no revierte el caso ya confirmado | 2 tests: estado de negocio comparado byte a byte; y un `Proxy` que registra **cada** método del repositorio invocado | ✅ El caso sigue `authorized`, la autorización `accepted`, el hash de la versión intacto. El proxy confirma que el worker solo tocó `claimBatch`/`markSent`/`markFailedWithRetry`/`markDead`/`health` — ninguna tabla de negocio |

**Matiz honesto sobre la prueba 1**, en la misma línea que la nota de
arquitectura de `DATATEK_R0_E_FASE1_REPORT.md` §2.1: Node es
single-threaded, así que `Promise.all` no crea dos hilos reales. Ahora bien,
la diferencia con el caso de folios de la Fase 1 **sí es sustantiva y vale
la pena precisarla**: allí el algoritmo leía y escribía en pasos separados,
así que dos "transacciones" sobre el mismo snapshot colisionaban de verdad.
Aquí elegir-y-estampar es **una sola operación sin `await` intermedio**, que
es precisamente la propiedad que aporta `for update skip locked`. Por eso
este repositorio sí reproduce su garantía y aquel no reproducía la suya. Los
tests verifican el **estado persistido** (lease, `attempts`, `status`), no
solo el valor de retorno, para no depender del orden de resolución de
promesas.

Además de las 5 obligatorias: 3 tests de backoff/`next_attempt_at`, 3 de
heartbeat/health (incluido que `health` no expone `payload`, `lastError` ni
`lockedBy`), 3 de correlation/causation y aislamiento por organización
(incluido que una actualización con la organización equivocada **no
aplica**), 3 de handlers permitidos, y 13 de sanitización.

### 1.4 Un bug propio, encontrado por un test que falló

La lista de redacciones de `sanitizeOutboxError` tenía las rutas POSIX
**antes** que las URLs. El patrón de ruta (`(?:\/[\w.-]+){2,}`) también
encaja con el `//host/segmento` de una URL, así que
`https://api.ejemplo.com/v1/send?to=x` se degradaba a `https:/[path]?to=x`.

- **No era una fuga** — el host quedaba igualmente redactado.
- **Sí era una etiqueta engañosa** para quien lee `last_error`.
- Corregido reordenando (URL antes que rutas) y **documentado en el propio
  archivo** como nota de orden, para que nadie lo reintroduzca.

Lo registro porque el estándar de este proyecto es reportar hallazgos
reales, incluidos los propios.

### 1.5 Restricciones de R0 respetadas — y por qué son estructurales

Sección 8 prohíbe explícitamente "ningún envío real" y "ningún PDF final".
Eso no se sostiene con una promesa: **`OutboxHandlerDeps` es la única
superficie que un handler puede tocar**, y solo contiene sumideros de
registro locales y una vista de **solo lectura** de upload intents. Ningún
handler recibe cliente HTTP, transporte de mensajería ni generador de
documentos. Para que un handler enviara algo de verdad habría que ampliar
ese tipo, lo que vuelve visible en revisión cualquier intento futuro.

Los 3 tipos de mensaje registrados son exactamente los casos R0 permitidos:
`notify.customer.authorization_prepared`, `notify.customer.authorization_reissued`
(registro de intento local, `channel: "simulado_local"`), y
`maintenance.uploads.cleanup_orphaned` (registra los vencidos, **no los
borra** — borrar evidencia desde un proceso de fondo no está autorizado en
R0, y el motor todavía no expone `CancelUploadIntent`, deuda #4 de Fase 1).
Un test fija esa lista de 3, así que agregar un cuarto tipo rompe el test.

### 1.6 El proceso corre de verdad

```
$ node src/index.ts
{"level":"info","app":"worker","event":"outbox.cycle.completed","workerId":"worker-2836","attempts":0,"environment":"local","at":"2026-08-03T06:34:50.180Z"}
{"level":"info","app":"worker","event":"worker.health",...,"result":"succeeded",...}
{"health":{"workerId":"worker-2836","lastHeartbeatAt":"...","status":"healthy","cyclesRun":1,
  "outbox":{"countsByStatus":{"pending":0,"processing":0,"sent":0,"failed":0,"dead":0},
  "oldestPendingAgeSeconds":null,"deadCount":0}},"persistence":"in_memory_only"}
EXIT=0
```

Sale con código 0. **Por defecto no corre en bucle**, a propósito: `pnpm dev`
en la raíz es `pnpm -r --parallel run dev`, y un bucle infinito colgaría el
arranque del workspace — exactamente lo que el placeholder de R0-B evitaba.
El modo por defecto es un drenado acotado; `--loop` activa el bucle continuo.

El campo `"persistence":"in_memory_only"` está en la salida a propósito: el
proceso **declara** que no drena la tabla real, en vez de aparentarlo.

---

## 2. Parte B — Cabeceras de seguridad (sección 9)

### 2.1 Punto de partida

Verificado leyendo ambos archivos: `apps/web/next.config.ts` y
`apps/control/next.config.ts` tenían **cero** cabeceras de seguridad (solo
`reactStrictMode`, `transpilePackages` e `ignoreBuildErrors`).

Fuente única nueva: `packages/config/security-headers.mjs` (+ su `.d.mts`
para que `tsc --noEmit` siga verde), consumida por la función `headers()` de
las dos apps para que no puedan divergir en silencio.

### 2.2 Tabla de cabeceras — valores exactos, medidos por HTTP

Los valores de abajo **no están transcritos del código**: son la salida real
de `curl -D -` contra un `next build` + `next start` servido en los puertos
4188 (web) y 4189 (control).

| Cabecera | `apps/web` | `apps/control` | Verificado |
|---|---|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src 'none'; worker-src 'self' blob:` | idéntica | ✅ curl + navegador |
| `X-Content-Type-Options` | `nosniff` | `nosniff` | ✅ curl |
| `X-Frame-Options` | `DENY` | `DENY` | ✅ curl |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `strict-origin-when-cross-origin` | ✅ curl |
| `Permissions-Policy` | 16 capacidades a `()`, `fullscreen=(self)` | idéntica | ✅ curl |
| `Cross-Origin-Opener-Policy` | `same-origin` | `same-origin` | ✅ curl |
| `Cross-Origin-Resource-Policy` | `same-origin` | `same-origin` | ✅ curl |
| `X-DNS-Prefetch-Control` | `off` | `off` | ✅ curl |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` **solo en producción** | idem | ✅ presente en `next start`, **ausente** en `next dev` |
| `X-Powered-By` | **eliminada** (`poweredByHeader: false`) | eliminada | ✅ `grep -ci` → 0 |

Reglas específicas por ruta:

| Ruta | Cabecera adicional | Valor medido |
|---|---|---|
| `/a/:token*` (web) | `Cache-Control` | `no-store, no-cache, must-revalidate, max-age=0, private` |
| `/a/:token*` (web) | `Pragma` / `Expires` | `no-cache` / `0` |
| `/a/:token*` (web) | `Referrer-Policy` | **`no-referrer`** (sobrescribe la global; comprobado que **no se duplica**) |
| `/api/:path*` (web) | `Cache-Control` | `no-store, ...` (medido sobre `/api/dev/commands`, que además devuelve 404 en producción por su propio guard) |
| `/:path*` (control) | `Cache-Control` | `no-store, ...` en **toda** la app |

En `apps/web` la home sí conserva `Cache-Control: s-maxage=31536000` porque
es una página estática de marketing prerenderizada — correcto, y por eso la
regla de `no-store` se aplica a `/a/` y `/api/`, no indiscriminadamente.

### 2.3 La CSP funciona — evidencia, no afirmación

El brief era explícito: "una CSP que rompe la app es peor que ninguna".
Verificación real, en un build de producción:

1. **La app renderiza.** `/pass` responde 200 y muestra "Hola, Cliente";
   `/a/demo-token-review` muestra "Revisa la solicitud"; Control muestra su
   formulario de login.
2. **La hidratación ocurre.** En navegador, `typeof self.__next_f !== "undefined"`
   devuelve `true`. Ese objeto lo crea un `<script>` **inline** de Next: si
   la CSP lo hubiera bloqueado, estaría `undefined` y la página no
   hidrataría. Es la prueba directa de que la política permite lo que Next
   necesita.
3. **La navegación cliente funciona.** Un clic en el enlace a `/pass/garage`
   llevó a esa ruta y renderizó el encabezado "Garage".
4. **Un Server Action real funciona.** Se envió el formulario de login de
   Control en el navegador: POST → `303 See Other`, cookie puesta, y se
   renderizó el dashboard ("Estado general"). Esto ejercita `form-action 'self'`.
5. **Cero errores de consola** y **cero violaciones de CSP** en todas las
   páginas visitadas.
6. **Los chunks cargan bajo `script-src 'self'`**: todas las peticiones a
   `/_next/static/chunks/*.js` devolvieron 200.

### 2.4 Debilidad declarada: `script-src 'unsafe-inline'`

**Es una debilidad real y la declaro en vez de esconderla.** Next.js App
Router inyecta scripts inline en cada respuesta (el bootstrap y los
fragmentos `self.__next_f.push(...)` que transportan el payload RSC).
Medido: `/pass` sirve **17 etiquetas `<script>`** e incluye `self.__next_f`
inline. Sin `'unsafe-inline'` el navegador bloquea ese bootstrap y la página
no hidrata.

La solución correcta es una CSP con **nonce por request**, que en Next exige
un `middleware.ts` que lo genere y propague. **No se introdujo en esta
fase**: es un componente nuevo en la ruta de cada request de ambas apps, y
esta fase de hardening no es el lugar para meterlo sin poder probarlo a
fondo. Queda como deuda #1 (sección 7), no como algo resuelto.

`'unsafe-eval'` aparece **solo en desarrollo** (lo necesita el HMR de
webpack). Comprobado empíricamente: la respuesta del servidor de producción
no lo trae; la del servidor de desarrollo en el puerto 4177 sí, junto con
`connect-src 'self' ws: wss:`.

### 2.5 HSTS: por qué condicional

No se emite en desarrollo, por una razón concreta y no de estilo:
`Strict-Transport-Security` le ordena al navegador **no volver a hablar http
con ese host**. Como todo aquí se sirve en `http://localhost`, emitirlo en
dev arriesga envenenar el `localhost` del desarrollador para **cualquier
otro proyecto** (el HSTS se guarda por host, **sin puerto**), dejándolo
inaccesible por http.

En modo producción sí se emite: los navegadores **ignoran** esta cabecera
cuando llega sobre http, así que un `next start` local no se ve afectado, y
un despliegue real sobre https queda protegido sin depender de que alguien
lo recuerde. `preload` se omite deliberadamente: inscribir un dominio en la
lista de precarga es prácticamente irreversible y **no existe dominio
productivo** (`env.ts` de ambas apps rechaza cualquier site URL que no sea
localhost).

---

## 3. Parte B — Cookies (sección 9)

### 3.1 Auditoría antes/después

Las opciones estaban escritas inline en los dos `fixture-login-form.tsx`, sin
ninguna prueba. Ahora hay una definición única por app
(`apps/web/src/lib/session-cookie.ts`, `apps/control/src/lib/session-cookie.ts`),
con 11 tests.

| Requisito sección 9 | Web — antes | Web — después | Control — antes | Control — después |
|---|---|---|---|---|
| `httpOnly` | ✅ `true` | ✅ `true` | ✅ `true` | ✅ `true` |
| `secure` en entornos aplicables | ✅ `NODE_ENV==="production"` | ✅ igual | ✅ igual | ✅ igual |
| `sameSite` explícito | ✅ `lax` | ✅ `lax` (justificado) | ⚠️ `lax` | ✅ **`strict`** |
| **expiración diferenciada** | ❌ **ninguna** (cookie de sesión) | ✅ **`maxAge` 8 h** | ❌ **ninguna** | ✅ **`maxAge` 1 h** |
| Control separado | ✅ nombre distinto | ✅ + `sameSite` + expiración distintos | — | — |
| rotación/revocación documentada | ❌ **inexistente** | ⚠️ mecanismo + doc (sin UI) | ❌ | ⚠️ igual |

**El hallazgo real fue la expiración.** Ambas apps emitían cookies de sesión
sin `maxAge` y con opciones **idénticas** — es decir, la "expiración
diferenciada" que pide la sección 9 no existía en ningún sentido. Ahora:

- **Pro/Pass: 8 h** — la duración de un turno de taller. Quien abre Pro por
  la mañana no se reautentica a media jornada, pero la sesión no sobrevive
  al día siguiente en una computadora compartida.
- **Control: 1 h** — opera sobre **múltiples** organizaciones bajo elevación
  temporal de soporte; una sesión de plataforma olvidada abierta es peor que
  una de taller. Alineado con el modelo acotado en el tiempo de
  `support_access_sessions`. Un test verifica que Control **expira antes**
  que Pro, no solo que ambos tengan un número.

`sameSite` en Control pasó a `strict` porque no hay flujo legítimo que
llegue a Control desde un enlace externo. Web se queda en `lax` a propósito
y con la razón escrita: Pass y `/a/[token]` se abren desde enlaces que el
cliente recibe **fuera** del sitio (WhatsApp/SMS), y con `strict` la cookie
no viajaría en esa primera navegación.

**Nota que vale la pena conservar:** en `localhost` las cookies **no se
aíslan por puerto**. Web (`:3000`) y Control (`:3001`) comparten espacio de
cookies, así que la separación por **nombre** (`dtek_actor` vs
`dtek_control_actor`) no es cosmética — si ambas hubieran usado el mismo
nombre, entrar a Control habría cerrado la sesión de Pro. Esto se observó de
forma incidental durante la verificación: el navegador en el puerto 4189
mostraba una cookie `__next_hmr_refresh_hash__` puesta por **otro** servidor
de desarrollo en un puerto distinto. Un test fija ambos nombres.

### 3.2 Verificación en navegador

Tras un login real en Control, `document.cookie` **no contiene**
`dtek_control_actor`. Es prueba directa de que el navegador está aplicando
`httpOnly`, no solo de que el código lo pide.

### 3.3 Rotación y revocación — estado honesto

- **Rotación**: cada login reescribe la cookie completa, renovando la
  ventana. No hay rotación automática a mitad de sesión; con Supabase Auth
  real la hará el refresh del JWT, no este módulo.
- **Revocación**: `buildClearedSessionCookieOptions()` / su equivalente en
  Control producen la instrucción de borrado (`maxAge: 0`), conservando
  `path` y atributos (un navegador solo sobrescribe una cookie si
  coinciden). **Ninguna pantalla la invoca todavía: no existe botón de
  "salir" en Pro ni en Control.** El mecanismo queda listo y probado; la UI
  es deuda #4, y no la agregué porque tocar los shells afecta a los E2E y a
  la accesibilidad, que son alcance de la Fase 4.
- **Límite conocido, no una regresión**: la cookie fixture guarda el id del
  actor **en claro y sin firmar**. Quien pueda escribir una cookie en el
  navegador puede suplantar a otro actor sembrado. Es el diseño explícito de
  R0-C (el login no acepta contraseña: es un selector de actor) y desaparece
  cuando Supabase Auth emita un JWT firmado. Lo dejo declarado como riesgo,
  no como algo resuelto.

---

## 4. Parte B — Requests y Server Actions (sección 9)

### 4.1 Estado previo

`zod` solo se usaba en `apps/web/src/app/api/dev/*` y en los dos `env.ts`.
Los **Server Actions reales no usaban Zod**: validaban con `if (!x || !y)`.

### 4.2 Qué se endureció

| Server Action | Antes | Después |
|---|---|---|
| `submitAuthorizationDecision` (`/a/[token]`) | 3 `if` de presencia + enum, **sin límite de tamaño** | Esquema Zod con topes: token ≤ 512, ids ≤ 128, `rejectionReason` ≤ 1 000, `acceptedQuoteItemIds` ≤ 200 |
| `prepareAndSendAuthorizationRequest` (Pro) | 1 `if` de presencia | Esquema Zod con topes + `orgSlug` restringido a `^[a-z0-9-]+$` |
| `loginAction` (web) | escribía cualquier string | **allowlist** contra actores y organizaciones sembradas |
| `loginAction` (control) | escribía cualquier string | **allowlist** contra actores de **plataforma** |

### 4.3 Dos bugs reales corregidos

**(a) Redirect controlado por el emisor — `apps/web/src/components/fixture-login-form.tsx`.**
El `orgSlug` venía del `FormData` y se interpolaba sin validar en el destino
del redirect:

```ts
const orgSlug = String(formData.get("orgSlug") ?? FIXTURE_ORGANIZATIONS[0].slug);
redirect(`/pro/o/${orgSlug}/dashboard`);
```

Un Server Action es un POST invocable directamente: que el `<select>` solo
ofrezca valores válidos no impide mandar otros. **Después**, el destino se
construye desde el **catálogo**, nunca desde el formulario:

```ts
const organization =
  FIXTURE_ORGANIZATIONS.find((o) => o.slug === requestedOrgSlug) ?? FIXTURE_ORGANIZATIONS[0];
redirect(`/pro/o/${organization.slug}/dashboard`);
```

**(b) Cookie de sesión sembrable con un valor arbitrario — ambas apps.**
`store.set(SESSION_COOKIE_NAME, actorId, ...)` escribía el string recibido
tal cual. En Control el impacto era mayor: se podía escribir el id de un
actor **de taller** en la cookie de **plataforma**. Ahora ambos validan
contra su lista cerrada y, si no hay coincidencia, redirigen con un error
neutral que no confirma si el actor existe.

El impacto real de (b) estaba acotado — `resolveWebSession`/
`resolveControlSession` resuelven capacidades contra el snapshot de tenencia,
así que un id inventado no otorgaba permisos. Pero escribir entrada no
validada en la cookie de sesión es exactamente lo que la sección 9 prohíbe
con "Server Actions revalidan como endpoints públicos", y el arreglo es
acotado y seguro.

### 4.4 Errores sin stack ni PII

Ningún Server Action devuelve el detalle de Zod al cliente. Es deliberado y
está comentado en ambos archivos: los `issues` de Zod incluyen el `path` y a
veces el valor recibido — que aquí sería **el token del cliente**. Se
devuelve un mensaje genérico y estable.

Comprobado además: **cero `console.log/info/warn/error`** en
`apps/web/src`, `apps/control/src` y `packages/application/src`.

---

## 5. Parte B — Auditoría del enlace de autorización (9 puntos)

No se reimplementó nada: es una auditoría del modelo que R0-D ya dejó
cerrado, con evidencia por punto.

| # | Punto (sección 9) | Veredicto | Evidencia |
|---|---|---|---|
| 1 | entropy suficiente | ✅ **Cumple** | `randomBytes(32).toString("base64url")` — 256 bits de CSPRNG (`authorization-commands.ts:203`) |
| 2 | hash-only | ✅ **Cumple** | Solo se persiste `sha256Hex(secret)` como `tokenHash` (`:210`). El `plainToken` se devuelve al llamador y nunca se guarda. El payload de auditoría usa `tokenId` (id de ruteo público), nunca el secreto (`:251`) |
| 3 | cinco intentos | ✅ **Cumple** | `MAX_TOKEN_ATTEMPTS = SECURITY_SPEC.authorization_token_max_attempts`; `resolveToken` incrementa `attemptCount` ante hash incorrecto y pone `lockedAt` al alcanzar el máximo (`:426-432`). Clave del diseño: la búsqueda entra por el `tokenId` **público** primero, así que una conjetura equivocada **sí** incrementa el contador de la fila correcta — sin eso, el bloqueo no sería exigible |
| 4 | rate-limit contract | ⚠️ **Parcial** | Contrato definido y probado en esta fase (`authorizationVerify`, `authorizationTokenPage`, 8 campos cada una). **Sin cablear a ninguna ruta y no productivo** — ver sección 6 |
| 5 | expiración/revocación | ✅ **Cumple** | `resolveToken` trata `revokedAt`, `lockedAt`, `usedAt` y `expiresAt <= now` como `alreadyDead` (`:411-420`). El comando de reemisión revoca el par anterior; test "old token dead, new token works" (`authorization-commands.test.ts:640`) |
| 6 | consumo atómico | ✅ **Cumple** (con matiz) | `usedAt` se fija en la **misma** transición de estado que crea la autorización y pasa la solicitud a `decided` (`:862`). Matiz: la atomicidad la da el motor síncrono, no una transacción de base — mismo matiz honesto que la Fase 1. En Postgres lo dará la transacción real |
| 7 | errores neutrales | ✅ **Cumple** | **Todas** las rutas de fallo de `resolveToken` devuelven el mismo `tokenInvalidError()`: id inexistente, expirado, revocado, bloqueado, secreto incorrecto y scope insuficiente. La página colapsa todo a una sola vista "no es válido" |
| 8 | no analytics con token | ⚠️ **Parcial — mejorado en esta fase** | Ver abajo |
| 9 | prueba de replay | ✅ **Cumple** | Dos tests preexistentes: misma idempotency key → mismo resultado, **1 sola** autorización (`:447`); key **distinta** sobre solicitud ya decidida → `TOKEN_INVALID` y sigue habiendo 1 autorización (`:474`). Más los tests de concurrencia de la Fase 1 |

### 5.1 Punto 8 en detalle — lo que encontré y lo que arreglé

**Encontrado (riesgo real):** el token viaja **en la ruta** (`/a/<token>`) y
antes de esta fase la app **no emitía `Referrer-Policy` en absoluto**. El
valor por defecto de los navegadores modernos
(`strict-origin-when-cross-origin`) manda la URL **completa** en `Referer`
para peticiones del mismo origen. Cualquier subrecurso o navegación saliente
desde esa página podía llevarse el token.

**Arreglado y verificado:**

- `/a/:token*` ahora responde `Referrer-Policy: no-referrer` — medido por
  `curl`, y comprobado que **no se duplica** con la política global.
- `/a/:token*` ahora responde `no-store, no-cache, must-revalidate,
  max-age=0, private`. Antes era cacheable por un proxy compartido, que
  podía servir la cotización de **un** cliente al siguiente visitante de la
  misma URL.
- Verificado que `next start` **no registra rutas de petición**: el token no
  apareció en el log del servidor de producción tras pedir
  `/a/demo-token-review` (`grep` vacío sobre el log).
- Verificado que no hay `console.*` en el código de aplicación, y que
  `revalidatePath()` usa la misma ruta opaca, sin loguearla.

**Riesgo que permanece (estructural, no arreglable en esta fase):** como el
token está en la **ruta**, cualquier proxy inverso, CDN o balanceador de un
despliegue futuro lo escribirá en su access log por defecto. No se puede
cerrar con cabeceras; exige cambiar el diseño de entrega del token (por
ejemplo, fragmento `#` no enviado al servidor, o canje del token por una
cookie de sesión corta en la primera visita). Queda como deuda #2.

---

## 6. Parte C — Rate limits (sección 10)

### 6.1 Declaración obligatoria, primero

La sección 10 termina con: *"No se declara rate limiting productivo si solo
existe una interfaz local."*

**Lo que hay es exactamente esa interfaz local, y no se declara productivo.**
`InMemoryRateLimiter` cuenta en un `Map` dentro de **un** proceso Node. Por
lo tanto:

- no protege nada si hay más de una instancia (N instancias multiplican por
  N el límite efectivo);
- se reinicia con el proceso, así que provocar un reinicio limpia la cuota;
- no sobrevive a un despliegue ni a un escalado horizontal.

**Producción necesita un backend distribuido (Redis/Upstash o equivalente)**
detrás de `RateLimiterAdapter`. Ese cambio no toca las políticas: son datos.

Y un segundo hecho que también hay que decir claro: **ninguna ruta ni Server
Action invoca `consume()` todavía.** Cablearlo exige decidir de dónde sale
la IP del cliente — `x-forwarded-for` solo es confiable detrás de un proxy
propio; sin él es falsificable, y usarlo tal cual sería **peor que no
limitar**, porque daría una falsa sensación de protección. Esa decisión
depende de una topología de despliegue que R0 no tiene. Lo dejo sin cablear
en vez de conectarlo a un identificador falsificable y llamarlo "listo".

### 6.2 Las 6 políticas con sus 8 campos

Archivo: `apps/web/src/lib/rate-limit.ts`. 15 tests.

| Ámbito | (1) Sujeto / bucket | (2) Ventana | (3) Límite | (4) Respuesta | (5) Retry-after | (6) Privacidad del identificador | (7) Observabilidad | (8) Caída del proveedor |
|---|---|---|---|---|---|---|---|---|
| **login** | `client_ip` / `auth:login` | 300 s | 10 | `429` + mensaje neutral | sí, en segundos | HMAC-SHA256(ip, sal de proceso), 32 hex — **nunca la IP** | `rate_limit.login.exceeded` | **fail_open** — el login fixture no acepta contraseña, no hay credencial que romper por fuerza bruta. Con Supabase Auth real hay que re-evaluar a fail_closed |
| **verificación de autorización** | `authorization_token_id` / `auth:verify` | 300 s | 10 | `429` + neutral | sí | HMAC del `tokenRowId` (ya público, pero se hashea para que el bucket no sea un índice de qué enlaces existen) | `rate_limit.authorization_verify.exceeded` | **fail_open** — existe un tope duro **independiente**: los 5 intentos por token con bloqueo, aplicados dentro de `resolveToken`. Aunque el limiter caiga, nadie pasa de 5 fallos |
| **`/a/[token]`** | `client_ip` / `public:a-token` | 60 s | 30 | `429` + neutral | sí | HMAC(ip) — nunca la IP, nunca el token de la URL | `rate_limit.authorization_token_page.exceeded` | **fail_open** — es vista de lectura; el tope de 5 intentos protege la parte que decide |
| **booking** | `actor_id` / `agenda:booking` | 60 s | 20 | `429` + neutral | sí | HMAC(actorId) | `rate_limit.booking.exceeded` | **fail_open** — la integridad de la agenda **no** depende del limiter: la doble reserva la impide el `EXCLUDE` de `resource_reservations` (`0060`) |
| **endpoints públicos** | `client_ip` / `public:generic` | 60 s | 60 | `429` + neutral | sí | HMAC(ip) | `rate_limit.public_endpoints.exceeded` | **fail_open** — superficie de solo lectura; un fallo no habilita ninguna escritura |
| **creación de upload intent** | `actor_id` / `evidence:upload-intent` | 60 s | 30 | `429` + neutral | sí | HMAC(actorId) | `rate_limit.upload_intent_create.exceeded` | **fail_closed** — el **único**, a propósito: cada intent reserva almacenamiento y **no hay ningún otro tope independiente** que lo acote. Un upload bloqueado es recuperable; el agotamiento de recursos no |

### 6.3 Decisiones que vale la pena resaltar

- **La IP nunca se persiste.** La sal es aleatoria **por proceso**, así que
  el hash no es reversible **ni estable en el tiempo**: una IP no puede
  correlacionarse entre reinicios ni cruzarse con ninguna tabla externa. El
  costo es que los contadores se pierden al reiniciar — limitación real del
  adapter local, declarada, y otra razón por la que esto no es productivo.
  Un backend distribuido necesitará una sal **compartida y secreta**.
- **Los 6 mensajes de rechazo son idénticos y neutrales.** Un test lo fija:
  un mensaje distinto por ámbito revelaría qué recurso se está tocando.
- **Cada ámbito tiene su propio `bucketScope`**, así que agotar el límite de
  login no consume el de booking (test dedicado).
- **Ventana fija, no sliding**, a propósito: es la semántica que un
  `INCR`+`EXPIRE` de Redis reproduce exactamente, así que el reemplazo por
  el adapter distribuido no cambiará el comportamiento que estos tests fijan.
- El evento de observabilidad **nunca** contiene el identificador crudo
  (test que serializa el evento y verifica que la IP no aparece).

---

## 7. Scan de secretos (sección 9)

Barrido sobre todo el árbol (`apps/`, `packages/`, `supabase/`, `scripts/`,
`docs/`, `tests/`, `.env.example`), excluyendo `node_modules/`, `.next/`,
`.turbo/`, `dist/`, `test-dist/` y `pnpm-lock.yaml`.

**`.env.local` NO fue leído ni copiado.** Solo se verificaron hechos sobre
él (que existe y que está ignorado). Ningún valor real aparece en este
reporte.

| Pregunta | Resultado |
|---|---|
| ¿`.gitignore` cubre `.env.local`? | ✅ Sí — `.gitignore:8` (`.env.local`) y `:9` (`.env.*.local`). Un solo `.gitignore`, sin anidados que puedan re-incluirlo |
| ¿`.env.example` solo tiene placeholders? | ✅ Sí — 10 variables, todas placeholder (`local`, `3000`, `http://localhost:*`). Las 3 de Supabase están **comentadas y sin valor**. **Cero** strings con forma de JWT |
| ¿Claves reales en el árbol? | ✅ Ninguna. Cero JWT (`eyJ...` de 3 segmentos), cero `sk_live`/`pk_live`/`AKIA`/claves privadas. Los únicos aciertos de `service_role`/`sk_live` están **dentro de un guard de CI** (`scripts/test-db-contract.mjs:22-23`) que existe para **bloquearlos** |
| ¿Service Role en código de cliente? | ✅ No hay camino. Solo 4 variables `NEXT_PUBLIC_*` (nombres de entorno y URLs de sitio); solo 8 lecturas de `process.env` en todo el árbol, todas `NEXT_PUBLIC_*` o `NODE_ENV`; los 8 archivos con `"use client"` **no leen ninguna** variable de entorno. Intersección vacía |
| ¿URLs productivas? | ✅ Ninguna. Todo es `localhost`/`127.0.0.1` o URLs de `$schema` de herramientas. **Cero** `*.supabase.co` (la única aparición del string está en el guard de CI). `supabase/config.toml` usa `project_id = "datatek-r0b-local"`, sin vínculo remoto |
| ¿Source maps o reportes comprometidos? | ✅ Ninguno. Cero `*.map` fuera de directorios de build |
| ¿Legado DTEKPro? | ✅ Solo 2 apariciones, ambas texto: `README.md:16` (fuera de alcance) y `legal/terms/page.tsx:15` (copy que **afirma** que nunca se escribe en DTEKPro). Cero imports, cero URLs, cero escrituras |

**Dos observaciones — ninguna es una fuga:**

1. **El árbol no es todavía un repositorio git** (`git rev-parse` falla desde
   `app/`). `.gitignore` es correcto pero **nunca ha sido ejercido**: nada
   ha sido rastreado nunca. Conviene confirmar que `.env.local` aparece
   ignorado inmediatamente después del primer `git init`.
2. **`supabase/seeds/local_actors.sql:23`** contiene una contraseña de
   desarrollo compartida en claro (`v_password`) para 11 cuentas fixture,
   con el comentario "nunca usar fuera de local", sobre el dominio no
   enrutable `@datatek.local`. Es una credencial local correctamente
   etiquetada, **no** un secreto productivo. La única precaución es que ese
   seed jamás se aplique contra una base no local — cosa que el guard de
   `scripts/test-db-contract.mjs` ya cubre por host.

---

## 8. Pipeline — comandos exactos y resultado real

Corridos por esta sesión desde `C:\Users\Dominic\Documents\Datatek gt\app`.

| Paso | Comando | Resultado |
|---|---|---|
| 0 | `pnpm install --offline` | **Verde** — necesario por las nuevas devDependencies de `apps/worker`. `resolved 446, reused 234, downloaded 0, added 0` — **nada se descargó**, todo salió del store local |
| 1 | `pnpm format:check` | Falló la 1.ª vez (5 archivos nuevos sin formatear) → `npx prettier --write` sobre esos 5 → **verde**: "All matched files use Prettier code style!" |
| 2 | `pnpm lint` | **Verde** — 0 errores. 2 warnings preexistentes (`no-console` en `packages/domain/scripts/generate-spec.mjs`). Nota: la Fase 1 reportaba **3** warnings, uno de ellos en `apps/worker`; ese desapareció porque el host nuevo usa `process.stdout.write` en vez de `console.log` |
| 3 | `pnpm typecheck` | Falló la 1.ª vez (`TS7016`: el `.mjs` de cabeceras no tenía declaraciones) → se agregó `packages/config/security-headers.d.mts` → **verde**, 10/10 proyectos |
| 4 | `pnpm spec:check` | **Verde** — "Generated spec artifacts match domain-spec.r0.yaml." |
| 5 | `pnpm test` | **Verde** — **371 tests, 371 pass, 0 fail** |
| 6 | `pnpm build` | **Verde** — `apps/web` (46 rutas) y `apps/control` compilan con webpack |

### 8.1 Conteo de tests por paquete

| Paquete | Antes (Fase 1) | Ahora | Delta |
|---|---|---|---|
| `packages/database` | 2 | 2 | — |
| `packages/domain` | 68 | 68 | — |
| `packages/testkit` | 2 | 2 | — |
| `packages/auth` | 29 | 29 | — |
| `packages/application` | 172 | 172 | — |
| `packages/ui` | 18 | 18 | — |
| `apps/web` | 7 | **30** | **+23** |
| `apps/control` | 7 | **13** | **+6** |
| `apps/worker` | 0 (sin tests) | **37** | **+37** |
| **Total** | **305** | **371** | **+66** |

Desglose de los 66: 37 del worker (24 `worker.test.ts` + 13
`sanitize.test.ts`), 15 de rate limits, 6 + 5 de cookies (web + control),
y 3 de nombres/contratos de cookie.

---

## 9. Efecto colateral en el entorno — hay que decirlo

**El servidor de desarrollo del puerto 4177 se reinició solo y su estado en
memoria se perdió.**

- **Qué pasó**: Next.js vigila su propio `next.config.ts` y **reinicia el
  servidor de desarrollo** cuando cambia. Agregar las cabeceras de seguridad
  exige, por definición, editar ese archivo. El PID del proceso en 4177
  cambió de `12504` a `14564`.
- **Yo no lo maté.** No ejecuté ningún comando contra ese proceso; el
  reinicio lo hizo Next por sí mismo.
- **Consecuencia real**: el motor de comandos vive en memoria y —como
  documenta `commands-engine.ts`— solo dura lo que dura el proceso de
  `pnpm dev`. Al reiniciarse, volvió al estado fixture base. **El caso
  sembrado con folio `2026-00002` ya no existe**: comprobado, el estado no
  contiene ningún `folioCode`.
- **Estado actual del 4177**: **vivo y sano**, responde 200, y ya sirve las
  cabeceras nuevas — con la variante correcta de desarrollo (`'unsafe-eval'`
  y `connect-src ... ws: wss:` presentes, **sin** HSTS). Eso confirma de
  paso, empíricamente, que la lógica condicional dev/prod funciona.
- **Cómo recuperar el caso**: recrearlo con `POST /api/dev/commands`, la
  misma vía que se usó para sembrarlo.

**Además**: los servidores que escuchaban en 3000 y 3001 al comenzar la
sesión ya no están escuchando. **No puedo atribuir la causa con certeza** y
no voy a inventar una: los candidatos son el mismo reinicio por cambio de
`next.config.ts` y el `pnpm install --offline` (que re-enlaza `node_modules`
bajo procesos en ejecución). Solo detuve explícitamente los servidores de
verificación que yo mismo levanté en 4188/4189, con su PID exacto.

Los dos servidores de producción que levanté para medir cabeceras fueron
detenidos al terminar.

---

## 10. Deuda explícita

Ninguna de estas se arregló en silencio ni se presenta como resuelta.

1. **CSP con `script-src 'unsafe-inline'`** (§2.4). Debilidad real. Cerrarla
   exige CSP con nonce por request, lo que implica un `middleware.ts` nuevo
   en la ruta de cada request de ambas apps. No introducido en esta fase.
2. **El token de autorización viaja en la ruta** (§5.1). El `Referer` ya
   está cerrado (`no-referrer`) y la caché compartida también (`no-store`),
   pero un access log de proxy/CDN en un despliegue futuro **sí** lo
   registrará. Cerrarlo exige cambiar la entrega del token (fragmento `#` o
   canje por cookie de sesión corta en la primera visita).
3. **Rate limiting no es productivo y no está cableado** (§6.1). Requiere
   backend distribuido **y** una decisión sobre la procedencia confiable de
   la IP del cliente.
4. **No existe UI de cierre de sesión** en Pro ni en Control (§3.3). El
   mecanismo de revocación está implementado y probado; falta el punto de
   entrada. No lo agregué porque tocar los shells afecta E2E y
   accesibilidad, alcance de la Fase 4.
5. **La cookie de sesión fixture no está firmada** (§3.3). Riesgo conocido y
   heredado del diseño de R0-C (login sin contraseña). Desaparece con
   Supabase Auth real.
6. **El worker no drena la tabla `outbox_messages` real** (§1.6). Solo
   existe la implementación en memoria. El contrato con el SQL literal está
   escrito; falta una fase con Docker que añada el repositorio Postgres.
7. **Nada ESCRIBE en el outbox todavía.** Esta fase entrega el consumidor;
   los comandos del motor (`PrepareAuthorizationRequest`, etc.) todavía no
   encolan mensajes. El worker está probado contra filas sembradas en
   tests, no contra un productor real. Conectar productor y consumidor es
   trabajo de una fase futura.
8. **`atomicidad` del consumo de token depende del motor síncrono**, no de
   una transacción de base (§5, punto 6). Mismo matiz que la Fase 1.
9. **El árbol no es un repositorio git** (§7). `.gitignore` es correcto pero
   nunca ejercido; verificar tras el primer `git init`.
10. **HSTS sin `preload`** (§2.5), a propósito, hasta que exista un dominio
    productivo real.

---

## 11. Archivos tocados

**Nuevos:**

- `apps/worker/src/index.ts`, `apps/worker/src/outbox/{types,memory-repository,sanitize,handlers,worker,test-helpers}.ts`
- `apps/worker/src/outbox/{worker,sanitize}.test.ts`
- `apps/worker/{tsconfig.json,tsconfig.test.json}`
- `packages/config/security-headers.mjs`, `packages/config/security-headers.d.mts`
- `apps/web/src/lib/{session-cookie,rate-limit}.ts` + sus `.test.ts`
- `apps/control/src/lib/session-cookie.ts` + `.test.ts`

**Modificados:**

- `apps/worker/package.json` (dev/build/typecheck/test reales + devDependencies)
- `apps/web/next.config.ts`, `apps/control/next.config.ts` (cabeceras, `poweredByHeader: false`)
- `apps/web/src/components/fixture-login-form.tsx`, `apps/control/src/components/fixture-login-form.tsx` (allowlist + política de cookie centralizada)
- `apps/web/src/app/a/[token]/actions.ts`, `apps/web/src/app/(pro)/pro/o/[orgSlug]/cases/[caseId]/actions.ts` (Zod + límites de payload)
- `apps/web/tsconfig.test.json`, `apps/control/tsconfig.test.json` (registro de los tests nuevos)
- `packages/config/package.json` (`files`)
- `pnpm-lock.yaml` (devDependencies de `apps/worker`; nada descargado)

**Eliminado:** `apps/worker/src/index.mjs` (placeholder de R0-B).

Ninguna migración SQL fue creada ni modificada. **Ningún SQL fue ejecutado.**
Ninguna operación de git fue ejecutada. `C:\Users\Dominic\Documents\GitHub\DATATEK\`
no fue tocado.
