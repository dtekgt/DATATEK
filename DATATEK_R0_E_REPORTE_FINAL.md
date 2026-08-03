# Reporte final — Foundation Release R0

Fecha: 2026-08-03 · Release: `r0-e` · Versión: `0.1.0`

> El handoff dice: *"No se usa lenguaje optimista si una puerta falló."* Dos
> puertas de la sección 19 **no pasan**, y una tercera no se puede evaluar
> porque el criterio nunca fue definido. Están arriba, no enterradas al final.

---

## 0. Veredicto

**R0 NO cierra.** El código y la documentación están completos y verdes en
todo lo que esta máquina puede ejecutar; lo que falta no es trabajo pendiente
de escribir, es **evidencia que este entorno no puede producir**.

| Bloqueo | Por qué | Qué lo levanta |
|---|---|---|
| Migraciones nunca ejecutadas | No hay Docker Desktop ni Supabase CLI | una sesión con Docker: `pnpm db:reset && pnpm test:db` |
| pgTAP nunca ejecutado | ídem | ídem |
| E2E de Playwright nunca ejecutado | La política de Application Control de Windows bloquea el Chromium descargado | desbloquear el binario o correr en CI/Linux |
| Matriz de comprensión | Requiere un conductor no técnico y personal nuevo del taller, personas reales | sesión con esas personas |
| Diez promesas bilaterales | **No están enumeradas en ninguno de los cinco documentos normativos** | definirlas en R0-A |

Lo que sí está demostrado, está demostrado contra el sistema corriendo, no
contra su descripción.

---

## 1. Resultado real

| Puerta | Resultado |
|---|---|
| `pnpm typecheck` | **0 errores** |
| `pnpm test` | **418 tests · 418 pass · 0 fail** |
| `pnpm lint` | **0 errores** (2 warnings `no-console` preexistentes en `packages/domain`) |
| `pnpm format:check` | limpio |
| `pnpm spec:check` | artefactos coinciden con `domain-spec.r0.yaml` |
| `pnpm test:db` | contrato estático OK · **ejecución real pendiente de entorno** |
| `pnpm test:legacy` | **0 hallazgos** en 4 comprobaciones (nuevo en Fase 4) |
| `pnpm reconcile:r0` | **OK** — 78/78 tablas, 58/58 entradas, 0 diferencias de paridad (nuevo) |
| `pnpm verify:authz` | **15/15 escenarios** contra el servidor corriendo (nuevo) |
| `pnpm test:e2e` | **no ejecutable en esta máquina** |

Los tres gates nuevos existen porque tres criterios de la Puerta 19 no tenían
forma de verificarse: aislamiento del legado, reconciliación de 78 tablas y
58 rutas, y los escenarios de autorización que Playwright no puede correr.

---

## 2. Arquitectura

Monorepo pnpm + Turborepo, TypeScript estricto.

```
packages/domain        TypeScript puro, sin I/O — invariantes y registro de rutas
packages/application   comandos, consultas, observabilidad
packages/ui            componentes; nunca busca datos
apps/web               Next.js 16.2.12 — público, Pro, Pass, Market, /a/[token]
apps/control           Next.js — plataforma, separado por ADR 0004
apps/worker            outbox
```

Las dependencias apuntan en una sola dirección: `domain ← application ← apps`.
`packages/ui` no importa `application`.

En esta máquina el motor de comandos es **in-memory**, persistido en
`globalThis.__datatekCommandsEngine` para sobrevivir la reinstanciación de
módulos del dev server de Next. Reiniciar el servidor borra el estado.

ADR: `0001-modular-monolith`, `0002-tenancy-and-rls`, `0003-quote-versioning`,
`0004-control-separation`.

---

## 3. Rutas funcionales y planificadas

| Superficie | Archivos | Funcionales | `Planificado` |
|---|---:|---:|---:|
| Sitio público | 10 | 10 | 0 |
| Datatek Pro | 15 | 3 | 12 |
| Datatek Pass | 9 | 6 | 3 |
| Datatek Market | 9 | 3 | 6 |
| Datatek Control | 13 | 6 | 7 |
| **Total** | **56** | **28** | **28** |

**58 entradas de registro no son 58 archivos**, y la diferencia importa
porque contar archivos y llamarlo "58 rutas" da un número que cuadra por
accidente:

```
58 entradas de registro
−5 registros dobles   (`/pass` y `/market` sirven dos superficies;
                       `/`, `/security` y `/status` existen en web Y control)
=53 paths distintos
+3 paths con archivo en ambas apps
=56 archivos page.tsx
```

`pnpm reconcile:r0` verifica la paridad exacta de conjuntos: **0 rutas
servidas sin declarar, 0 declaradas que nadie sirve.**

Cada ruta `Planificado` declara propósito, dependencia, release y por qué está
deshabilitada — nunca un "próximamente" genérico.

---

## 4. Migraciones y tablas

13 migraciones, `0000` a `0090`. **78 tablas creadas, 78 esperadas, 78 con RLS
habilitada.**

| Migración | Tablas |
|---|---:|
| `0000_foundation` | 0 (extensiones, helpers, auditoría) |
| `0010_identity_tenancy_isolation` | 17 |
| `0020_crm` | 5 |
| `0030_vehicles_access` | 6 |
| `0040_catalog` | 4 |
| `0050_intake_cases` | 10 |
| `0060_scheduling` | 8 |
| `0070_inspection_evidence` | 12 |
| `0080_quote_authorization` | 8 |
| `0085_transactional_trust` | 4 |
| `0086_features` | 2 |
| `0087_documents` | 2 |
| `0090_query_projections_and_health` | 0 (proyecciones) |

El ER está en `docs/domain/er-implemented.md` y se **genera** desde las
migraciones, no se escribe a mano: un ER redactado a mano describe lo que
alguien creyó implementar. Si alguien agrega una tabla sin regenerarlo, el
gate falla.

**Ninguna de estas migraciones se ha ejecutado nunca.** Son artefactos
autorizados y revisados estáticamente. `implemented_pending_environment_evidence`.

---

## 5. Pruebas con conteos

| Paquete | Tests |
|---|---:|
| `packages/domain` | 68 |
| `packages/application` | 216 |
| `packages/ui` | 21 |
| `apps/web` | 30 |
| `apps/control` | 13 |
| `apps/worker` | 37 |
| otros (config, contratos) | 33 |
| **Total** | **418** |

Fuera de la suite, verificado contra el sistema corriendo en esta sesión:

- **15/15 escenarios de autorización** (`pnpm verify:authz`);
- **11 pantallas sin una sola falla de contraste** WCAG AA;
- **5 viewports mínimos** sin scroll horizontal ni objetivos táctiles < 24 px;
- **2 endpoints de salud** devolviendo `degraded`, nunca `healthy` con `unknown`.

**E2E de Playwright: 0 ejecutados.** Las especificaciones existen en
`tests/e2e/` y no se han corrido nunca en esta máquina.

---

## 6. Credenciales

Todas demo local. La contraseña de los actores seed
(`datatek-local-dev-only`) sólo es válida contra Supabase Auth local.

`pnpm test:legacy` inspecciona **343 archivos de fuente** y falla si aparece
un host Supabase productivo, una clave `sk_live`/`pk_live`, una llave privada,
un JWT embebido o un bucket de producción. Hoy: **0 hallazgos**.

El gate fue validado contra violaciones sintéticas antes de confiar en su
cero: detectó las 5 que se le plantaron y salió con código 1.

---

## 7. ADR

`docs/adr/0001-modular-monolith.md`, `0002-tenancy-and-rls.md`,
`0003-quote-versioning.md`, `0004-control-separation.md`.

---

## 8. Riesgos y límites

**Bloqueantes de R0** (sección 0).

**No bloqueantes, explícitos:**

1. **CSP de desarrollo permisiva.** `script-src` incluye `'unsafe-inline'` y
   `'unsafe-eval'`, que Next necesita en dev. Producción exige nonces. No es
   un defecto hoy; es deuda que vence antes del primer despliegue.
2. **Estado in-memory.** Se pierde al reiniciar. Esperado en R0.
3. **Sesión por cookie fixture**, no JWT. Los tipos ya son los definitivos
   (`AccessBoundaryState`), así que cambiar el origen del dato no toca
   componentes consumidores.
4. **Aislamiento verificado en la capa de aplicación, no en la base.** Taller
   Demo no puede tocar un caso de DTEK y soporte sin elevación no puede
   escribir — ambos comprobados en vivo. Pero eso es la aplicación, no RLS.
   El aislamiento de base sigue pendiente de pgTAP.
5. **Legado DTEKPro.** Riesgos conocidos que no bloquean R0 local pero sí R4:
   rol admin derivado de metadata editable, catálogo desincronizado, texto
   "pagado" sin entidad financiera, migraciones no reconciliadas.

---

## 9. Comandos exactos (Windows / VS Code)

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm spec:check
pnpm test:db
pnpm test:legacy
pnpm reconcile:r0
```

Con el servidor corriendo:

```powershell
pnpm dev
$env:DATATEK_BASE_URL="http://localhost:3000"; pnpm seed:demo
$env:DATATEK_BASE_URL="http://localhost:3000"; pnpm verify:authz
```

Cuando exista Docker Desktop:

```powershell
pnpm db:reset
pnpm test:db
pnpm test:e2e
```

---

## 10. Primera tarea recomendada de R1

**No es una tarea de R1.** Es levantar Docker Desktop y correr `pnpm db:reset`
+ `pnpm test:db`. Tres de los cinco bloqueos de la sección 0 caen con eso, y
78 tablas que hoy nadie ha ejecutado dejarían de ser una promesa.

Después de eso, la primera de R1 es **órdenes de trabajo** (`work_orders`):
es lo que sigue naturalmente a una autorización aceptada, que hoy termina sin
destino.

---

## 11. Cobertura de las diez promesas bilaterales

**No evaluable.** El handoff las exige dos veces (§16.11 y §19) pero **no las
enumera en ninguno de los cinco documentos normativos**. Buscadas en los
cinco: sólo aparecen esas dos referencias.

No se inventan diez promesas para poder marcar la casilla. El criterio queda
abierto hasta que R0-A las defina.

---

## 12. Matriz R0 funcional versus `Planificado`

28 funcionales / 28 planificadas, detalle en la sección 3. Ninguna ruta
`Planificado` finge funcionar: `PlannedFeatureState` renderiza el objeto
`PlannedDetail` declarado en el registro.

Las cinco pantallas con datos de fixture llevan `DEMO DATA` visible
(verificado en vivo en `/market/workshops/[slug]`, `/organizations`,
`/organizations/[id]`, `/users`, `/support`).

---

## 13. Evidencia de `unknown`, `stale` y `conflict`

**`unknown` nunca se presenta como saludable.** `GET /api/health` en ambas
apps, capturado en vivo hoy:

```json
{"status":"degraded", "checks":[
  {"component":"web","status":"healthy","detailCode":"serving"},
  {"component":"worker","status":"unknown","detailCode":"no_shared_heartbeat_channel"},
  {"component":"database","status":"unknown","detailCode":"no_postgres_in_environment"},
  {"component":"outbox_lag","status":"unknown","detailCode":"depends_on_database"},
  {"component":"build_version","status":"healthy","detailCode":"build_metadata_present"}]}
```

Tres `unknown` con motivo explícito, y el rollup dice `degraded`, no
`healthy`. `rollUpHealth` decide con `some()` explícitos; un test recorre por
fuerza bruta todos los pares de estados para probar que `unknown` no puede
producir `healthy`.

**`conflict`** — el guard de doble reserva rechazó una segunda cita sobre la
misma bahía en el mismo rango durante la siembra de hoy
(`conflictosDeAgendaEsquivados: 1`). La máquina de estados rechazó también una
segunda `PrepareAuthorizationRequest` sobre un caso ya en
`waiting_authorization`.

**`stale`** — todo estado visible declara qué se sabe y de cuándo. El detalle
de salud lo hace con `detailCode` + prosa en español.

---

## 14. Resultados de comprensión

**No realizada.** Requiere un conductor no técnico y personal nuevo del
taller. No hay forma de simularla, y aprobarla por cuenta propia sería
exactamente la clase de auto-reporte que este proyecto prohíbe.

---

## 15. Deuda explícita para R1/R2

| # | Deuda | Vence |
|---|---|---|
| 1 | Ejecutar migraciones y pgTAP contra Postgres real | antes de R1 |
| 2 | Correr los 16 escenarios E2E en Playwright | antes de R1 |
| 3 | CSP con nonces en producción | antes del primer despliegue |
| 4 | Sesión real (Supabase Auth) en lugar de cookie fixture | R1 |
| 5 | Persistencia real en lugar del motor in-memory | R1 |
| 6 | Latido del worker en canal compartido (hoy `unknown`) | R1 |
| 7 | Definir las diez promesas bilaterales en R0-A | antes de cerrar R0 |
| 8 | Matriz de comprensión con personas reales | antes de cerrar R0 |

---

## Sección 19 — Puerta final

| # | Criterio | Estado |
|---:|---|---|
| 1 | R0-A aceptado | ✅ |
| 2 | R0-B verde | ✅ |
| 3 | R0-C verde | ✅ |
| 4 | R0-D verde | ✅ |
| 5 | install frozen pasa | ✅ |
| 6 | spec check pasa | ✅ |
| 7 | lint/format/typecheck pasan | ✅ |
| 8 | migraciones `0000`–`0090` parten de cero | ❌ **nunca ejecutadas** |
| 9 | tipos generados no tienen diff | ✅ |
| 10 | unit, pgTAP, integración y E2E pasan | ❌ **unit e integración sí (418); pgTAP y E2E nunca corrieron** |
| 11 | 58 rutas reconciliadas | ✅ 0 diferencias de paridad |
| 12 | 78 tablas reconciliadas con ER real | ✅ 78/78, ER generado |
| 13 | aislamiento DTEK/Taller Demo demostrado | ⚠️ **en la aplicación sí; en la base pendiente de pgTAP** |
| 14 | frenos llega a autorización | ✅ journey completo, folios 2026-00003 a 2026-00009 |
| 15 | Pro y Pass muestran la misma verdad | ✅ mismo `quoteVersionId` y `snapshotHash` |
| 16 | diez promesas bilaterales cubiertas | ❌ **no enumeradas en el spec** |
| 17 | matriz de comprensión aprobada | ❌ **no realizada** |
| 18 | `unknown`, `stale`, precio, decisiones, owner, bloqueo, respaldo pasan NO-GO | ✅ |
| 19 | viewports mínimos no ocultan CTA, total, confirmación o error | ✅ los 5 |
| 20 | concurrencia e idempotencia pasan | ✅ |
| 21 | seguridad y accesibilidad pasan | ✅ 0 fallas de contraste en 11 pantallas; headers verificados en vivo |
| 22 | no hay secretos/producción | ✅ gate ejecutable, 343 archivos |
| 23 | documentación y handoff completos | ✅ los 17 artefactos obligatorios existen |
| 24 | límites de R0 explícitos | ✅ secciones 0 y 15 |

**19 pasan · 4 fallan · 1 parcial.**

### Evidencia

| Campo | Valor |
|---|---|
| Commit de release | pendiente de sincronización |
| CI | no configurado |
| Unit tests | 418 pass / 0 fail |
| pgTAP | **no ejecutado** |
| Integración | incluida en los 418 |
| E2E | **no ejecutado** — Application Control bloquea Chromium |
| Accesibilidad | 11 pantallas, 0 fallas de contraste; 5 viewports OK |
| Riesgos abiertos | sección 8 |
| Estado | **`blocked_pending_environment`** |

R1 no comienza hasta que los cuatro ❌ se cierren.

---

## Apéndice — hallazgos de la Fase 4

Ninguno estaba en la lista de tareas; los cinco salieron de verificar en vez
de asumir.

1. **La pantalla de autorización no mostraba el total.** El cliente aprobaba
   un gasto viendo Q 450.00 y Q 250.00 por separado, sin la suma en ninguna
   parte del DOM. Corregido con un total **en vivo** —la autorización es por
   renglón, y un total estático dejaría de ser cierto al desmarcar una línea.
2. **El contador de rutas era el equivocado, no el código.** "56 vs 58" parecía
   un faltante; era la diferencia entre archivos y entradas de registro.
   Paridad real: 0 diferencias.
3. **Mi aserción de autorización parcial estaba mal, no el comando.** `items`
   trae una fila por línea marcada `accepted`/`rejected` — el diseño correcto,
   porque lo rechazado también es un hecho que hay que guardar.
4. **El 500 de Control era mi propio `.next` borrado**, no un defecto. Se
   confirmó reiniciando: HTTP 200.
5. **Las diez promesas bilaterales no existen en el spec.**

Los dos gates nuevos fueron validados contra violaciones sintéticas antes de
aceptar sus ceros: el de contraste detecta 1.92:1 y no marca 4.54:1; el de
legado detectó las 5 violaciones plantadas y salió con código 1. Un gate que
sólo se ha visto pasar no es un gate.
