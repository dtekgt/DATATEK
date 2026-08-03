# R0-E Fase 3 — Observabilidad, estados de interfaz y baseline de performance

Fecha: 2026-08-03
Alcance: `DATATEK_R0_E_HARDENING_HANDOFF.md` secciones 12 (performance) y 13
(logs / health / métricas), más la auditoría de estados de interfaz sobre el
inventario canónico de 58 rutas.

Este reporte declara lo que se midió, lo que no se pudo medir y por qué. No
declara verde nada que no se haya ejecutado.

---

## 0. Resumen de la corrida

| Puerta | Resultado |
|---|---|
| `pnpm format:check` | verde |
| `pnpm lint` | 0 errores, 2 advertencias (preexistentes, `packages/domain`) |
| `pnpm typecheck` | 9/9 paquetes verdes |
| `pnpm spec:check` | verde — los artefactos generados coinciden con `domain-spec.r0.yaml` |
| `pnpm test` | **415 / 415** (entrando a la fase: 371) |
| `pnpm build` | ver §3 |

Los 44 tests nuevos son de este pase: 16 de `logger`, 16 de `health`+`metrics`
y 12 de la instrumentación del motor.

---

## 1. Observabilidad (sección 13)

Cuatro módulos nuevos en `packages/application/src/observability/`.

### 1.1 Logs estructurados — `logger.ts`

La decisión que carga con el peso: **no existe un campo `message`**. El
registro es un objeto cerrado (`LogRecord`) donde cada campo tiene tipo y
significado, `event` es un identificador de vocabulario estable y el error se
identifica por CÓDIGO (`CommandErrorCode`), nunca por su texto. No hay forma
de concatenar el nombre de un cliente en una línea de log porque no hay campo
donde ponerlo. La prohibición es estructural, no una convención.

Los campos libres viven sólo en `extra`, cuyos valores son primitivos y pasan
siempre por `redactLogValue`.

#### Hallazgo: la redacción filtraba el secreto del enlace de autorización

`redactLogValue` aplicaba tres patrones en orden email → teléfono → token.
`String.replace` sustituye por `[etiqueta]`, y los corchetes no pertenecen a
ninguna de las tres clases de caracteres: **cada sustitución parte en dos lo
que quedaba alrededor.**

Un secreto de enlace es `randomBytes(32).toString("base64url")` — 43
caracteres del alfabeto `[A-Za-z0-9_-]`, que **incluye el guion**. Cuando el
secreto contenía una corrida de dígitos y guiones, el patrón de teléfono la
sustituía primero y partía el secreto en dos fragmentos de menos de 32
caracteres; el patrón de token, que corría después, ya no reconocía ninguno.

Comprobado sobre el formato real del enlace (`${uuid}.${secreto}`):

```
antes:   550e8400-…-446655440000.aBcDeFgHiJkLmNoPqRsTuVwXyZ[phone]_-abcXY
después: 550e8400-…-446655440000.[token]
```

Es decir: la versión anterior escribía en el log casi todo el secreto que ese
módulo existe para ocultar.

Corrección: orden **email → token → teléfono**, con cada par ordenado por
especificidad y documentado en el archivo. Cubierto por tests de regresión.

#### Hallazgo secundario: el patrón de teléfono mordía los uuid

`\+?\d[\d\s().-]{6,}\d` convertía `550e8400-e29b-41d4-a716-446655440000` en
`550e8400-e29b-41d4-a[phone]`. El comentario del archivo afirmaba lo
contrario ("sin tocar un uuid"). El patrón quedó anclado a ambos lados
(`(?<![A-Za-z0-9_-])…(?![A-Za-z0-9_-])`) para que un número no pueda empezar
ni terminar pegado a un identificador.

#### Límite declarado

La redacción **sobre-redacta** en la dirección segura: un folio como
`2026-00001` cumple la forma de teléfono y sale como `[phone]`. Se prefiere
perder legibilidad de un dato inocuo a arriesgar uno sensible. Los
identificadores que sí importan para correlacionar (`actorId`,
`organizationId`, `requestId`, `correlationId`) son campos de primer nivel y
**no pasan por la redacción** — `redactExtra` sólo toca `extra`.

### 1.2 Health — `health.ts` y dos endpoints

`GET /api/health` en `apps/web` y en `apps/control`. Públicos y sin sesión a
propósito: un balanceador no tiene credenciales.

La regla que gobierna el módulo es el NO-GO de la sección 18: **"`unknown` se
presenta como saludable" → R0 no se declara terminado.** `rollUpHealth` lo
impide por construcción — no existe combinación de entradas con un `unknown`
presente que devuelva `healthy`. Un test lo verifica por fuerza bruta sobre
todo el vocabulario de estados, precisamente para que la propiedad no dependa
de que alguien recuerde mantenerla.

`detail` no es texto libre: es un enum cerrado traducido a frases fijas. Un
`detail: err.message` habría filtrado, en este proyecto concreto, rutas del
filesystem de Windows o el host de una cadena de conexión.

Respuesta verificada en vivo contra el servidor en `:4177`:

```
HTTP/1.1 200 OK
Cache-Control: no-store, no-cache, must-revalidate, max-age=0, private

{"status":"degraded","version":"0.1.0","release":"r0-e","environment":"local",
 "checks":[{"component":"web","status":"healthy",…},
           {"component":"worker","status":"unknown",…},
           {"component":"database","status":"unknown",…},
           {"component":"outbox_lag","status":"unknown",…},
           {"component":"build_version","status":"healthy",…}]}
```

Tres de las seis señales salen `unknown` porque en este entorno **no son
medibles**: no hay Postgres alcanzable y el worker corre en otro proceso sin
canal de latido compartido. El global es `degraded`, nunca `healthy`. El
endpoint devuelve 200 igualmente: la app sí está sirviendo, y sacarla del
balanceo por no poder medir sus dependencias sería la reacción equivocada.

### 1.3 Métricas R0 — `metrics.ts`

Cinco requisitos de la sección 13, con su cobertura declarada explícitamente
por `describeMetricCoverage()` en vez de fingir cinco series de las cuales dos
serían ficción:

| Requisito | Estado | Serie |
|---|---|---|
| duración/error por comando | medido en proceso | `command.duration_ms`, `command.errors` |
| jobs pendientes/fallidos | **no medible aquí** | `outbox.jobs` (sin publicar) |
| intentos de autorización | medido en proceso | `authorization.attempts` |
| fallos de RLS | **no medible aquí** | — |
| E2E/build | artefacto de CI | — |

Sobre "fallos de RLS": RLS es una política de Postgres. Sin Postgres
alcanzable no ocurre ni un solo fallo de RLS real, así que un contador
`rls.denials` en 0 sería una mentira por omisión — leería como "cero
violaciones de aislamiento" cuando la verdad es "cero mediciones". Lo que sí
se cuenta es la denegación a nivel de **aplicación** (`FORBIDDEN`,
`MEMBERSHIP_INACTIVE`, `BRANCH_DENIED`, `TOKEN_INVALID`), que es una defensa
distinta y anterior, no un sustituto. Por eso la serie se llama
`access.denied` y **no existe** una llamada `rls.denials`; un test lo fija.

Ninguna de estas series se renderiza en Pro, Pass, Market ni en ninguna
pantalla de cliente. Un "casos atendidos este mes" pintado en Pro sería la
métrica de negocio inventada que la sección prohíbe. `pro.reports` sigue en
`planned` y esta fase no la activa.

**Límite declarado**: el registro es en proceso (`Map` en memoria), la misma
limitación y por la misma razón que `InMemoryRateLimiter` de la Fase 2. Se
reinicia con el proceso, N instancias producen N series parciales que nadie
suma, y no sobrevive a un despliegue. No es un backend de métricas y no se
declara como tal.

### 1.4 Instrumentación del motor — `command-observability.ts`

`instrumentCommandEngine` envuelve el motor entero recorriendo sus claves en
runtime, en vez de editar ~40 métodos uno por uno. La propiedad que compra:
**un comando nuevo queda instrumentado el día que se agrega**, sin que nadie
tenga que acordarse. Un test lo fija comparando la superficie envuelta contra
la del motor original.

Conectado en `apps/web/src/lib/commands-engine.ts`. De cada comando sale una
línea JSON a stdout con comando, resultado, duración, código de error estable,
`correlationId`, `actorId` y `organizationId`.

Lo que la línea **no** lleva, y un test lo verifica sobre el JSON serializado:
el `input` del comando. Ese objeto contiene, según el comando, el nombre de un
cliente, su teléfono o el secreto de un enlace. Loguear "el input" es la vía
más corta para convertir un log en una fuga.

Un `throw` se registra como `UNHANDLED` y **se vuelve a lanzar** — tragarse la
excepción convertiría un bug en un silencio. El texto del error y su stack no
se serializan.

---

## 2. Estados de interfaz — auditoría de las 58 rutas

Se abrieron los 56 `page.tsx` (43 en web + 13 en control; 58 − 2 rutas
compartidas), los 7 `layout.tsx` y los componentes de estado compartidos.

### 2.1 Lo que salió limpio

- **28 rutas con `planned` en el registro ↔ 28 páginas renderizando
  `<PlannedRoute>`.** Correspondencia uno a uno, sin desacuerdos en ninguna
  dirección: ninguna página finge tener implementación, y ninguna ruta
  planificada deja de declararlo.
- **Ninguna pantalla tiene más de una acción primaria.**
- **Cero imágenes** en el código de aplicación, así que no hay presupuesto de
  imágenes que vigilar todavía.

### 2.2 Hallazgos corregidos en esta fase

**a) `/a/[token]` en estado `review` era indistinguible de una solicitud real.**
El más grave del lote. La pantalla de ejemplo renderizaba **el mismo
componente** `AuthorizationCard` que el enlace real, con un hash de forma
auténtica (`a3f9c7e21b8d4f0012ab`) sobre renglones inventados — y, a
diferencia de sus cinco pantallas hermanas, **sin una sola palabra que la
declarara ejemplo**. En una plataforma cuyo producto es la confianza, una
pantalla de ejemplo que se hace pasar por real es el peor defecto posible.

Corregido con triple marcaje: badge `DEMO DATA`, aviso explícito, y un hash
que se declara falso en los 10 caracteres que la tarjeta llega a mostrar.
Verificado en vivo — antes `Hash: a3f9c7e21b…`, ahora `Hash: DEMO-NO-ES…`.

**b) Cinco pantallas renderizaban datos ficticios sin rótulo.**

| Ruta | Qué mostraba sin rotular |
|---|---|
| `market/workshops/[slug]` | nombre, ciudad y lista de servicios con precios |
| `control/organizations` | el censo de tenants |
| `control/organizations/[id]` | ticket, razón y vencimiento de una sesión elevada |
| `control/users` | quién tiene acceso a Control |
| `control/support` | la bitácora de accesos elevados |

Las tres primeras de Control tenían badge, pero describía el **alcance** del
dato ("metadata de plataforma", "sesión elevada activa"), no su
**procedencia**. En `market/workshops/[slug]` el contraste era más directo:
las dos páginas hermanas que leen el mismo view model sí rotulaban `DEMO
DATA`. Las cinco llevan ahora el rótulo.

**c) `CaseProofSummary` descartaba su propio flag `demo`.**
El view model siempre trajo `demo`, pero el componente nunca lo leía. La misma
tarjeta se renderiza sobre el motor real y sobre fixtures, así que el rótulo
de la página era lo único que las distinguía — y un "respaldo del caso" es
justo lo que se recorta y se comparte suelto.

**d) `PlannedRoute` de Control devolvía una página en blanco.**
Sus dos ramas de fallo (ruta inexistente, ruta sin bloque `planned`)
retornaban `null`. El usuario no podía distinguir "esta ruta aún no existe" de
"la página se rompió". La gemela de `apps/web` sí declaraba ambos casos: las
dos apps divergían justo donde más importa, en cómo fallan. Alineadas.

### 2.3 Hallazgos declarados, no corregidos

- **Las páginas `planned` sí disparan consultas, vía sus layouts.** Las de
  Pass pasan por `getPassHomeViewModel()`; las de Pro por
  `getWebSession(orgSlug, …)`; las de Control por `getControlSession()` +
  `getActiveElevationBanner()`. Las páginas son puras; la ruta renderizada no.
  No es incorrecto —el layout necesita la sesión para decidir el shell— pero
  no es gratis y queda dicho.
- **Ninguna app define `loading.tsx`, `error.tsx`, `not-found.tsx` ni
  `global-error.tsx`.** Verificado por glob: cero archivos. Tampoco hay un
  solo `<Suspense>`. Es deuda de la Fase 4, no un hallazgo de seguridad.
- **La home pública no tiene CTA primaria visible.** `LinkButton` usa
  `secondary` por defecto y `Conocer Pro` omite `variant`, así que las tres
  llamadas a la acción se ven iguales. Es una decisión de diseño a tomar, no
  un defecto que corregir a ciegas.

---

## 3. Baseline de performance (sección 12)

Detalle completo y método reproducible en `docs/perf/build-report-r0e.md`.

**El build no imprime tamaños en este entorno.** El binario nativo de SWC está
bloqueado por una política de Application Control de Windows, y con el
fallback WASM la tabla de rutas sale sin columnas de `Size` ni `First Load
JS`. Todas las cifras se midieron sobre los artefactos en `.next/static/`.

### Hallazgo: la librería de iconos completa en el bundle, dos veces

`icon.tsx` (en las dos apps) hacía `import * as icons from "lucide-react"` y
resolvía el icono por índice en runtime. Un namespace con lookup dinámico es
intree-shakeable por definición: el bundler no puede saber qué claves se
piden, así que las incluye todas. Costo medido: **1756 definiciones de icono,
603 KB en un solo chunk**, el 30% del JS de `apps/web` y el 35% del de
`apps/control` — pagado por separado en cada app.

Los nombres, sin embargo, salen del campo `icon` del registro canónico de
rutas: finitos y conocidos en tiempo de build. **45 iconos para 1756
empaquetados.**

Corregido con un mapa explícito de imports nombrados, movido a `packages/ui`
para no mantener dos listas a mano. Los `icon.tsx` quedaron como re-export, así
que ningún punto de llamada cambió.

| app | antes | después | delta |
|---|---|---|---|
| `apps/web` | 1,983 KB · 1756 iconos | **1,224 KB** · 53 | **−759 KB (−38.3%)** |
| `apps/control` | 1,739 KB · 1756 iconos | **990 KB** · 52 | **−749 KB (−43.1%)** |

La optimización introduce un modo de fallo nuevo —un icono fuera del mapa
caería al fallback en silencio— así que `route-icons.test.ts` verifica que el
mapa cubra todo el registro y que no sobre ninguno. Es la contraparte
obligatoria, no un extra.

Verificado funcionalmente en vivo sobre el workspace de un caso real: 20 SVG,
los 20 con geometría, cero vacíos, cero fallbacks.

### Otras observaciones

- Los cinco chunks mayores son framework (React, runtime de Next, polyfills):
  836 KB de los 1,224 KB de `web`. Es el piso de Next 16 con React 19.
- **`apps/control` no tiene ni una ruta estática**: 0 de 15. Su layout raíz
  lee cookies en toda petición, lo que fuerza render dinámico. Correcto, pero
  significa que cada navegación cuesta un render de servidor.
- Presupuestos declarados en el documento de perf. **No están automatizados**
  — falta el paso de CI que los verifique y falle. Declararlos sin cablearlos
  es la mitad del trabajo.

---

## 4. Deuda que esta fase deja declarada

1. **El worker no comparte canal de latido con la app.** Mientras siga así,
   `worker` y `outbox_lag` sólo pueden ser `unknown` desde el health de las
   apps. La fuente real es `datatek_platform.outbox_health` (migración 0090),
   que **no se ha ejecutado nunca** — no hay Postgres en este entorno.
2. **El registro de métricas es en proceso.** Producción necesita un colector
   externo detrás de `MetricsSink`. El cambio no toca los nombres de serie.
3. **`apps/worker` no importa `@datatek/application/observability`.** Node no
   hace type-stripping dentro de `node_modules/`, y un workspace package se
   resuelve por symlink ahí; el worker corre sin paso de build. Por eso
   `WorkerLogEntry` y `LogRecord` son dos tipos distintos que comparten
   vocabulario a propósito. Unificarlos exige darle un paso de build al
   worker.
4. **Sin estados `loading`/`error`/`not-found` en ninguna de las dos apps.**
5. **La instrumentación no cubre `apps/control`**, cuyo motor de comandos no
   existe todavía.
