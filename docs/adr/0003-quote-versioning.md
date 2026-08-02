# ADR 0003 — Cotización versionada con freeze inmutable y hash determinista

**Estado:** aceptado
**Fecha:** 2026-08-01
**Contexto:** R0-D Fase 3, ola `0080` (cotización y autorización)

## Contexto

DATATEK_R0_A sección 9.2 exige que una cotización congelada sea inmutable y
que su hash sea reproducible: "el hash no se recalcula desde una
representación diferente; un cambio crea una nueva versión". Al mismo
tiempo, sección 11 del vertical de frenos exige que el draft sea
libremente editable ("Pro permite: crear quote; crear versión; agregar
líneas...; editar solo draft"). Ambos requisitos — edición libre en draft,
inmutabilidad absoluta en frozen — conviven en la misma tabla lógica de
líneas (`quote_items`), lo que exige una frontera de estado explícita, no
una convención de aplicación que un bug futuro pueda saltarse.

Adicionalmente, el hash debe demostrar "determinismo real": dos
representaciones equivalentes de la misma cotización (incluso en objetos
distintos, con ids y timestamps distintos) deben producir el mismo hash, y
cualquier cambio de contenido debe producir uno distinto. Un hash que
dependiera del orden de inserción de las líneas o de metadata volátil
(created_at, ids autogenerados) no cumpliría ese contrato.

## Decisión

### 1. `quotes` agrupa versiones; el lifecycle vive en `quote_version`

`quotes` es un contenedor sin estado propio. Cada `quote_versions` fila
tiene su propio `draft | frozen | superseded | voided` (sección 5.4). Un
cambio de alcance, precio, descripción, término o vigencia siempre crea
una versión nueva — nunca una edición retroactiva de una versión ya
congelada.

### 2. Snapshot canónico y hash en una función de dominio pura

`packages/domain/src/quote/quote-snapshot.ts` (`buildQuoteSnapshot`) es la
única fuente de verdad del algoritmo:

1. ordena las líneas por `displayOrder` y luego por `description` — el
   orden de llegada del array nunca afecta el resultado;
2. valida moneda consistente y cantidad positiva por línea (usando `Money`
   de `packages/domain/src/value-objects/money.ts` para la aritmética —
   nunca reimplementada aquí);
3. calcula `lineTotalMinor` por línea y `subtotalMinor`/`totalMinor` como
   la suma;
4. construye un objeto canónico con **solo** el contenido semántico:
   `organizationId`, `caseId`, `currency` y las líneas (descripción,
   cantidad, precio, moneda, visibilidad, si requiere autorización,
   referencia de origen, orden) — deliberadamente **sin** `quoteId`,
   `versionNumber`, `frozenAt`, ids de fila ni actor;
5. serializa ese objeto con un `stableStringify` que ordena las claves de
   cada nivel recursivamente (JSON con claves ordenadas, sección 11);
6. genera el hash con `node:crypto` (`createHash("sha256")`) sobre esa
   cadena.

`FreezeQuoteVersion` (`packages/application/src/commands/
quote-commands.ts`) nunca reimplementa este cálculo — reúne las líneas
vigentes de la versión y le pasa el control entero a `buildQuoteSnapshot`,
exactamente como `CompleteInspection` delega en
`evaluateBrakesCompletionGate`.

Excluir `quoteId`/`versionNumber` del contenido hasheado es intencional:
dos cotizaciones **distintas** con contenido idéntico (mismo caso, misma
moneda, mismas líneas) deben producir el mismo hash — el hash certifica
"esto es lo que se cotizó", no "esta fila en particular". La prueba
`packages/application/src/commands/quote-commands.test.ts` ("produces the
SAME hash for two DIFFERENT quotes on the same case...") construye dos
`quotes` separadas con líneas equivalentes y verifica que sus hashes
coinciden pese a tener `id`/`quoteId`/`versionId`/`frozenAt` distintos.
`packages/domain/src/quote/quote-snapshot.test.ts` prueba lo mismo a nivel
de función pura, además de la invariancia de orden del array de líneas.

### 3. Inmutabilidad en dos capas: aplicación + base de datos

- **Aplicación:** `AddQuoteItem`/`UpdateDraftQuoteItem` verifican que la
  `quote_versions.status` dueña sea `draft` antes de mutar; si no, devuelven
  un `CommandError` de dominio (`CONFLICT`) sin tocar el estado.
- **Base de datos** (`supabase/migrations/0080_quote_authorization.sql`):
  - un trigger `BEFORE INSERT/UPDATE/DELETE` en `quote_items` rechaza
    cualquier mutación si la `quote_versions` dueña no está en `draft`;
  - un trigger `BEFORE UPDATE` en `quote_versions` deja que **todo** cambie
    mientras `frozen_at is null` (el camino draft normal, incluido el
    freeze mismo), pero una vez `frozen_at` está fijado, congela
    `snapshot_hash`, `snapshot_json`, `subtotal_minor`, `total_minor`,
    `currency`, `quote_id`, `case_id`, `version_number`, `frozen_at` y
    `frozen_by` — solo `status`/`superseded_*`/`voided_*` pueden seguir
    moviéndose (el camino `frozen -> superseded/voided`).

Esto cumple literalmente sección 9.2: "Postgres impide la edición y la
carrera concurrente; TypeScript valida y presenta, pero no es la única
defensa" — un bug de aplicación, o una ruta futura que se salte el
command layer, no puede mutar una versión congelada.

### 4. Freeze y envío son eventos distintos

`FreezeQuoteVersion` nunca toca `authorization_requests`; `MarkAuthorizationRequestSent`
nunca toca `quote_versions`. Un intento de envío fallido dejado registrado
en `authorization_events` (`eventType: "send_failed"`) no revierte el
freeze ni cambia el estado de la solicitud — la quote sigue `frozen`
esperando un reintento (sección 9.2/12).

### 5. Nueva versión revoca solicitudes pendientes de la anterior

`CreateQuoteVersion`, al crear una versión nueva sobre una `quote` que ya
tenía una versión `frozen`, marca esa versión anterior `superseded` y
revoca (`status: 'revoked'`) cualquier `authorization_requests` todavía
`prepared`/`sent`/`viewed` que apuntara a ella, además de revocar sus
`authorization_access_tokens` vivos — nunca deja una solicitud huérfana
apuntando a una versión reemplazada (sección 5.5).

## Alternativas consideradas

- **Hash sobre una representación JSON "tal cual" de las filas (sin
  canonicalizar):** rechazado. `JSON.stringify` sobre un objeto no
  garantiza orden de claves entre distintas rutas de construcción del
  mismo objeto lógico (p. ej. spread en distinto orden), y el orden de un
  array de líneas dependería de cómo la aplicación las leyera de la base
  — ninguna de las dos cosas es una propiedad del **contenido**.
- **Incluir `quoteId`/`versionNumber`/`frozenAt` en el hash:** rechazado.
  Ataría el hash a la identidad de fila en vez de al contenido, y haría
  imposible demostrar "determinismo real" entre dos objetos distintos con
  el mismo contenido — exactamente la prueba que sección 11 pide.
- **Inmutabilidad solo en la capa de aplicación (sin trigger en
  Postgres):** rechazado por la misma razón que ADR 0002 rechazó
  "aislamiento solo en la capa de aplicación": un bug o una ruta que
  evite el command layer podría mutar una versión frozen sin que ninguna
  prueba de aplicación lo note necesariamente.
- **Una sola columna `actor_id` en `authorizations`:** rechazada durante
  el diseño de esta ADR (documentado también en
  `docs/domain/authorization-security.md`) — un decisor por enlace
  seguro/Pass es un `customers.id`, no un `auth.users.id`; forzar una sola
  FK a `auth.users` habría sido incorrecta para esos dos métodos.

## Consecuencias

- Cualquier UI de Pro que muestre "editar línea" debe consultar
  `quote_versions.status` antes de ofrecer la acción — el backend la
  rechazará de todas formas, pero la UX debe reflejar la regla en vez de
  mostrar un botón que siempre falla.
- Un cambio futuro a los campos que entran al hash (p. ej. agregar
  impuestos/descuentos) es un cambio de contrato — todo hash ya emitido
  deja de ser reproducible con la nueva versión del algoritmo a menos que
  se versiones el propio esquema de snapshot (fuera de alcance de R0-D).
- El trigger de `quote_versions` enumera explícitamente los campos
  protegidos; agregar una columna económica nueva a la tabla en una ola
  futura exige actualizar también ese trigger, o quedará mutable después
  del freeze sin que ninguna prueba de aplicación lo detecte.
