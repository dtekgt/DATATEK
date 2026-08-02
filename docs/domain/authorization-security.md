# Seguridad de autorización — `/a/[token]` (R0-D Fase 3/4a, olas `0080`/`0086`)

Fuente normativa: `DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md` sección
12 y `DATATEK_R0_A_CONTRACT_PACK.md` sección 10 completa (contrato de
seguridad de `/a/[token]`). Cubre los 6 comandos de autorización en
`packages/application/src/commands/authorization-commands.ts`
(`PrepareAuthorizationRequest`, `MarkAuthorizationRequestSent`,
`VerifyAuthorizationAccess`, `RecordAuthorization`,
`InvalidateAuthorization`, y — desde Fase 4a —
`RevokeAndReprepareAuthorizationRequest`).

## Estado de la migración

`authorization_requests`, `authorization_access_tokens`, `authorizations`,
`authorization_items`, `authorization_events` (junto con `quotes`/
`quote_versions`/`quote_items`) viven en
`supabase/migrations/0080_quote_authorization.sql` — mismo estado "escrito,
no ejecutado" documentado en `brakes-slice.md`/`evidence.md`.

## Modelo de token: id público + secreto hasheado

`PrepareAuthorizationRequest` genera dos cosas por request:

- una fila `authorization_access_tokens` cuyo `id` (UUID) es el
  **componente público** del token — comparable a un key id, no secreto
  por sí mismo;
- un secreto aleatorio criptográficamente seguro (`node:crypto.randomBytes(32)`,
  codificado `base64url`) del que **solo se persiste**
  `sha256(secreto)` en `tokenHash` — el secreto en claro nunca llega al
  estado, a un log o a un evento de auditoría.

El string que el comando devuelve al llamador (`plainToken`, campo
`PrepareAuthorizationRequestOutput.plainToken`) es `${id}.${secreto}` —
exactamente lo que una URL `/a/[token]` real llevaría. Este formato
resuelve un problema concreto: si el link solo llevara el secreto y un
atacante adivinara mal, no habría fila que identificar para contar el
intento fallido. Con `id` público al frente, **cualquier intento —
correcto o incorrecto — identifica la fila real**, y es eso lo que hace
cumplible el límite de 5 intentos en vez de ser solo un contador que nunca
se alcanza.

`resolveToken` (función interna compartida por `VerifyAuthorizationAccess`
y la rama `secure_link` de `RecordAuthorization`) es el único lugar que
parte el token, busca la fila por `id`, y valida todo lo demás.

## Comparación de tiempo constante

`resolveToken` calcula `sha256(secreto_presentado)` y lo compara contra
`token.tokenHash` con `crypto.timingSafeEqual` (`packages/application/src/
commands/authorization-commands.ts`, función `constantTimeHashEquals`) —
nunca con `===` sobre los strings hex. Ambos buffers tienen longitud fija
(32 bytes / 64 caracteres hex de un digest SHA-256), así que
`timingSafeEqual` nunca lanza por longitudes distintas; el guard de
longitud existe de todas formas para el caso de un token malformado (sin
`.`, o con un segmento vacío) que ni siquiera llega a calcular un hash
comparable — ver el test `"a malformed token (no secret component) is
rejected without throwing"`.

Confirmar el uso real de `timingSafeEqual` (no solo la intención) es
verificable leyendo el import en la cabecera de
`authorization-commands.ts` (`import { createHash, randomBytes,
timingSafeEqual } from "node:crypto"`) y su único call site en
`constantTimeHashEquals`.

## Cinco intentos, bloqueo, y el mismo error siempre

Cada llamada a `resolveToken` con un secreto que no coincide:

1. incrementa `attemptCount` en la fila localizada por `id`;
2. si `attemptCount >= maxAttempts` (5, `SECURITY_SPEC.
   authorization_token_max_attempts`), fija `lockedAt`;
3. devuelve, en **todos los casos** — token inexistente, expirado,
   revocado, bloqueado, ya usado, o secreto incorrecto — exactamente el
   mismo `CommandError`: `{ code: "TOKEN_INVALID", message: "El enlace de
   autorización no es válido, expiró o ya no está disponible." }`
   (`tokenInvalidError()` en `packages/application/src/commands/
   context.ts`).

Ningún llamador recibe una pista de cuál de las cuatro razones aplicó —
sección 10.2 literal: "no se distingue públicamente entre token
inexistente, expirado o revocado". Una vez bloqueada (`lockedAt` no nulo),
la fila queda muerta incluso ante un secreto correcto presentado después
— el bloqueo gana sobre un acierto tardío, verificado explícitamente en
el test `"locks the token after exactly 5 wrong attempts..."`
(`authorization-commands.test.ts`), que hace 5 intentos fallidos
consecutivos, confirma que las 5 respuestas son idénticas (mismo
`code`/`message`), y luego confirma que un 6º intento con el secreto
**correcto** también falla con el mismo mensaje.

### Un detalle de arquitectura que este bloqueo exigió

El motor de comandos original (Fases 1–2) modela el resultado de un
comando como `{ ok: true; nextState; data } | { ok: false; error }` — la
rama de fallo **no** llevaba estado siguiente, porque ningún comando de
esas fases necesitaba mutar nada al fallar. El bloqueo de 5 intentos es el
primer caso real donde un fallo **sí** tiene un efecto secundario (el
contador incrementado, o el bloqueo). `CommandOutcome<T>`
(`packages/application/src/commands/state.ts`) se extendió con un
`nextState?` opcional en la rama de fallo, y `createCommandEngine`'s
`apply()` (`engine.ts`) lo aplica cuando está presente — aditivo y
retrocompatible; ningún otro comando existente lo usa.

## Consumo atómico (sección 10.3)

`RecordAuthorization` (rama `secure_link`) vuelve a ejecutar `resolveToken`
de forma independiente — nunca confía en que un `VerifyAuthorizationAccess`
previo siga siendo válido (una petición HTTP nueva no tiene memoria de la
anterior, exactamente como pasaría contra `/a/[token]` real). Solo si el
token resuelve con éxito y `scope === "read_and_decide"` continúa:

1. valida que `quoteVersionId` corresponda a la request;
2. valida que la `quote_versions` referenciada siga `frozen` (no
   `superseded`/`voided`);
3. valida que el hash recibido coincida EXACTO con
   `quoteVersion.snapshotHash` — un hash distinto es `CONFLICT`, nunca se
   intenta "adivinar" a qué versión se refería;
4. aplica idempotencia estándar (`findIdempotentReplay`/
   `appendIdempotencyRecord`, el mismo mecanismo que todo comando de este
   motor) — un doble submit con la MISMA `idempotencyKey` devuelve el
   mismo resultado sin crear una segunda fila `authorizations`;
5. inserta `authorizations` + un `authorization_items` por línea con
   snapshot (descripción/cantidad/precio/moneda), nunca una referencia
   viva a `quote_items`;
6. marca `usedAt` en el token y `status: 'decided'` en la request;
7. transiciona el caso vía el comando `TransitionCase` ya existente
   (`waiting_authorization -> ready` en aceptación total/parcial,
   `-> closed` en rechazo total) — nunca escribe `cases`/
   `case_status_events` a mano.

Un segundo intento sobre la MISMA request con una `idempotencyKey`
distinta falla: el token ya tiene `usedAt` fijado, así que `resolveToken`
lo trata igual que cualquier otro token muerto (mismo `TOKEN_INVALID`
neutral) — "una decisión... elimina capacidad de mutar" (sección 10.2) se
cumple sin necesitar un chequeo especial adicional.

## Acceso sin cuenta (guest) vs. decisión de staff

`VerifyAuthorizationAccess` y la rama `secure_link` de
`RecordAuthorization` **no llaman `requirePermission`** — son alcanzables
por un actor sin membresía de organización, a propósito:
`EXPERIENCE_SPEC.guest_authorization_requires_account = false`
(`packages/domain/generated/spec.constants.ts`). El token es la única
puerta.

La rama `staff_manual` de `RecordAuthorization` (un asesor registrando una
decisión tomada por teléfono, por ejemplo) sí exige el permiso
`authorization.decide` — que **solo** el template de rol `owner` tiene
(`advisor` tiene `authorization.request` pero no `.decide`); ver
`packages/domain/generated/spec.constants.ts`,
`ORGANIZATION_ROLE_TEMPLATES`.

### El caso interesante: transicionar el caso en nombre de un guest

`TransitionCase` normalmente exige el permiso `intake.manage`. Un cliente
invitado decidiendo por enlace seguro casi nunca lo tiene (no tiene
ninguna membresía). `RecordAuthorization` resuelve esto construyendo un
`CommandContext` interno mínimo (`systemCaseTransitionContext` en
`authorization-commands.ts`) con exactamente el permiso `intake.manage`
concedido, usado **solo** para esa única llamada interna a
`transitionCase` — la elevación se le concede al paso del sistema, no al
llamador, y está acotada al único permiso que ese paso necesita. Es el
mismo patrón que cualquier backend real usa cuando una acción de cliente
validada y estrecha (aquí: una decisión autenticada por token) dispara un
efecto secundario privilegiado — la autorización de dominio ya ocurrió
(el token era válido, el hash coincidía); lo que sigue es orquestación
interna, no una nueva superficie de ataque.

## `RevokeAndReprepareAuthorizationRequest` — el comando de reenvío (Fase 4a)

**Este hallazgo de Fase 3 está cerrado.** El resto de esta sección queda
como registro histórico de por qué hacía falta un comando nuevo, seguido de
cómo Fase 4a lo resolvió.

### El hallazgo (Fase 3)

DATATEK_R0_D sección 9 (`ProCaseExperienceViewModel`, tabla de siguiente
acción) anticipaba literalmente: *"esperando autorización: esperar o
**reenviar**"* — pero `PrepareAuthorizationRequest` vuelve a llamar
`TransitionCase(..., toStatus: "waiting_authorization")` en **cada**
invocación, sin excepción para "el caso ya está ahí". Verificado por HTTP
contra el motor de fixtures
(`docs/runbooks/quote-authorization-journey.md`): una segunda llamada a
`PrepareAuthorizationRequest` sobre un caso que ya está
`waiting_authorization` fallaba con `CONFLICT` — `"No existe una transición
válida de 'waiting_authorization' a 'waiting_authorization'."`
(`packages/domain/src/case/case-transitions.ts`, `waiting_authorization`
solo tiene aristas hacia `ready`/`closed`). La única vía de recuperación
disponible entonces cuando el token de un cliente se bloqueaba (5 intentos
fallidos) o expiraba era `RecordAuthorization` con `method: "staff_manual"`
sobre la MISMA `authorizationRequestId` — cubre "el cliente decide igual"
(un asesor registra la decisión tomada por teléfono), pero no el literal
"reenviar un enlace nuevo que el cliente pueda volver a usar por su
cuenta".

### La solución (Fase 4a)

`RevokeAndReprepareAuthorizationRequest` — nombre elegido sobre la
alternativa `ReissueAuthorizationToken` que este mismo documento sugería
antes, porque el efecto es más amplio que "solo un token nuevo": revoca y
reemplaza la fila `authorization_requests` completa, no solo rota un
secreto por debajo de una fila sin cambios. Esto es lo que permite que el
enlace reenviado lleve su propia `expiresAt`/`allowedMethods`/`scope`
frescos, independientes de la solicitud que reemplaza — mismo patrón que
`CreateQuoteVersion` ya usa para revocar solicitudes pendientes de una
versión superseded (`quote-commands.ts`).

Dado un caso en `waiting_authorization` con una `authorization_requests`
vigente (`prepared`/`sent`/`viewed` — el mismo conjunto "vigente" que
`CreateQuoteVersion` usa para decidir qué solicitudes supersede una versión
nueva), el comando:

1. exige el permiso `authorization.request` (mismo permiso que
   `PrepareAuthorizationRequest`/`MarkAuthorizationRequestSent`);
2. valida el flag `authorization_reissue` (ola `0086` — ver abajo);
3. marca la solicitud vieja `revoked`, con `revokedReason` y un nuevo
   `authorization_events.eventType = 'revoked'` (distinto de `'superseded'`,
   que sigue significando exclusivamente "una versión nueva reemplazó
   esta");
4. revoca cualquier token vivo de esa solicitud (`revokedAt` fijado) — el
   `resolveToken` compartido nunca lee `request.status`, así que sin este
   paso un secreto todavía válido seguiría resolviendo aunque su request
   ya estuviera muerta;
5. crea una `authorization_requests` NUEVA para la MISMA `quoteVersionId`
   (la misma versión frozen, mismo hash) y un token NUEVO, con su propio
   evento `'prepared'`;
6. **no toca el estado del caso** — ya está `waiting_authorization` y se
   queda ahí, sin ningún `TransitionCase`.

`MarkAuthorizationRequestSent` se reutiliza tal cual para registrar el
envío del enlace reenviado — no necesitó ningún cambio; ya aceptaba
cualquier `authorizationRequestId` en estado `prepared`/`sent`.

Pruebas (`authorization-commands.test.ts`, describe
`"RevokeAndReprepareAuthorizationRequest"`): revocar + reenviar produce un
`plainToken` nuevo y un `requestId` nuevo; el token viejo falla
`TOKEN_INVALID` en `VerifyAuthorizationAccess` inmediatamente después; el
token nuevo verifica y puede completar una decisión real
(`RecordAuthorization`) que mueve el caso a `ready`; la versión/hash
congelados no cambian; una solicitud ya `decided` no puede
revocarse-y-reenviarse (`CONFLICT`); `reason` es obligatorio; un reintento
con la misma `idempotencyKey` no duplica la fila nueva.

### El flag `authorization_reissue` (ola `0086`)

`RevokeAndReprepareAuthorizationRequest` es el "flag real y comprobable"
que sección 1 de R0-D pide para la ola `0086`: `isFeatureEnabled`
(`packages/application/src/commands/state.ts`) resuelve
`FEATURE_KEY_AUTHORIZATION_REISSUE` por organización (override gana sobre
`defaultEnabled`; una clave nunca seedeada resuelve `false` — fail closed,
nunca "activo por accidente"). El seed real vive en
`packages/application/src/commands/fixtures.ts` (ambas organizaciones
demo con el flag en `true`) y en `supabase/migrations/0086_features.sql`
(mismo flag, mismo `default_enabled = true`). La prueba de que el flag
realmente gatea algo — no solo existe en schema — está en
`authorization-commands.test.ts`, test `"fails when the feature flag is
disabled for the organization"`.

## Qué NO hace todavía

- No existe la ruta HTTP pública `/a/[token]` — esta fase expone los
  comandos vía el endpoint de desarrollo (`apps/web/src/app/api/dev/
  commands/route.ts`), verificado con curl. Una fase futura construye la
  página real que llama a estos mismos comandos.
- No hay adaptador de envío real (SMS/WhatsApp/email) — `MarkAuthorizationRequestSent`
  registra el intento (canal/resultado/actor) pero nunca despacha un
  mensaje real, exactamente como pide sección 12: "No envía un mensaje
  real... nunca afirma entrega por API".
- No hay expiración activa por cron — un `authorization_requests`/
  `authorization_access_tokens` vencido se detecta al momento de usarlo
  (`expiresAt` comparado contra `now`), no por un job que cambie su
  `status` a `expired` de forma proactiva. El campo existe; el job queda
  pendiente, igual que la limpieza de `upload_intents` huérfanos
  documentada en `evidence.md`.
- `supabase/tests/0080_quote_authorization.sql` (pgTAP) no se escribió
  todavía — el alcance explícito de R0-D Fase 3 pidió migración completa +
  pruebas de dominio TypeScript, no pgTAP. Queda como trabajo pendiente
  explícito para mantener paridad con 0010–0070, cada una de las cuales sí
  tiene su archivo pgTAP. Lo mismo aplica a `0085`/`0086`/`0087` (Fase 4a):
  son artefactos SQL completos y revisados estáticamente, sin pgTAP propio
  todavía.
- No existe un comando `SetFeatureFlagOverride` — togglear un override por
  organización hoy requiere una fila insertada a mano (seed o Postgres
  directo). Documentado también en `query-contracts.md`.
