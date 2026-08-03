# Runbook — semillas de prueba

Tres capas de datos de prueba, con propósitos distintos. Confundirlas es la
forma más rápida de creer que algo está verificado cuando no lo está.

| Capa | Dónde vive | Qué prueba | Corre hoy |
|---|---|---|:---:|
| Fixtures en TypeScript | `packages/application/src/fixtures/*.ts` | unidad e integración de dominio/aplicación | sí |
| Seed SQL de actores | `supabase/seeds/local_actors.sql` | RLS y tenancy contra Postgres real | **no** |
| Semilla del journey | `scripts/seed-demo-journey.mjs` | la aplicación corriendo, por HTTP | sí |

La capa SQL no corre en esta máquina: no hay Docker Desktop ni Supabase CLI
(`docs/runbooks/database-reset.md`). Todo lo que dependa de ella está
`implemented_pending_environment_evidence` y así se declara — no "verificado".

---

## 1. Fixtures en TypeScript

`packages/application/src/fixtures/tenancy.ts` define el mismo grafo de
actores que el seed SQL: 2 organizaciones (`org-dtek-servicios`,
`org-taller-demo`) y 10 actores (`u-owner-dtek`, `u-advisor-dtek`,
`u-inspector-dtek`, `u-mechanic-dtek`, `u-cashier-dtek`, `u-customer-dtek`,
`u-owner-demo`, `u-customer-demo`, `u-platform-support`, `u-platform-admin`).

`buildFixtureCrmVehicleState()` (en `commands/fixtures.ts`) construye el
estado inicial del motor de comandos: clientes, vehículos, catálogo y la
bahía `res-dtek-bay-1` que usa la agenda.

Los IDs son literales fijos, no `gen_random_uuid()`. Es deliberado: los
pgTAP referencian esos IDs, así que un segundo `db:reset` debe producir
exactamente los mismos.

Detalle de actores, emails y contraseña local: `local-auth-seeds.md`.

---

## 2. Semilla del journey completo

```bash
pnpm seed:demo
```

Con el servidor de desarrollo corriendo en otro puerto:

```bash
DATATEK_BASE_URL=http://localhost:4177 pnpm seed:demo
```

**No inserta filas.** Emite los mismos comandos que emite la interfaz, contra
`/api/dev/commands`. Esa distinción es el punto: una semilla que escribe
estado directamente puede producir un estado que la aplicación nunca podría
alcanzar, y entonces la demo prueba algo que no existe. Aquí, si una
transición de la máquina de estados es inválida, la semilla falla.

Recorre el journey feliz completo de la sección 14 del handoff: cliente
provisional → vehículo → intake manual → caso → agenda → recepción con
odómetro → inspección de frenos (68 renglones: 8 ítems × 4 esquinas + 4 de
vehículo) → cotización → congelado → solicitud de autorización.

Imprime al final:

```json
{
  "caseId": "…", "folioCode": "2026-00003", "customerId": "…",
  "vehicleId": "…", "quoteVersionId": "…", "quoteItemIds": ["…", "…"],
  "authorizationRequestId": "…", "plainToken": "…",
  "snapshotHash": "ff8438bf…", "totalMinor": 70000,
  "conflictosDeAgendaEsquivados": 1,
  "casoEnPro": "http://…/pro/o/dtek-servicios/cases/…",
  "enlaceDeAutorizacion": "http://…/a/<id>.<secreto>"
}
```

El enlace en claro **sólo existe en esa salida**. El servidor guarda el hash
del secreto, nunca el secreto (`docs/domain/authorization-security.md`). Si
se pierde, no se recupera: hay que reemitir con
`RevokeAndReprepareAuthorizationRequest`, que revoca el anterior.

### Por qué la semilla busca una ventana de agenda libre

`conflictosDeAgendaEsquivados` no es cosmético. El guard de doble reserva es
real, así que una semilla con hora fija sólo funciona la primera vez: la
segunda choca con la bahía que dejó ocupada la primera. La semilla pide la
siguiente hora hasta encontrar una libre y reporta cuántas rechazó. Un valor
mayor que cero es evidencia de que el guard está disparando.

### El estado es in-memory y se pierde al reiniciar

El motor vive en `globalThis.__datatekCommandsEngine`. Reiniciar el servidor
de desarrollo borra todo lo sembrado — incluidos los enlaces de autorización
emitidos. Es esperado en R0: no hay persistencia hasta que exista Postgres.

---

## 3. Escenarios de autorización

```bash
DATATEK_BASE_URL=http://localhost:4177 pnpm verify:authz
```

Siembra tres casos independientes y ejercita 15 escenarios contra el
servidor corriendo, por HTTP:

| # | Escenario | Esperado |
|---|---|---|
| 1 | token válido | resuelve al caso correcto |
| 2 | secreto alterado, id válido | rechazo |
| 3 | token inexistente | rechazo |
| 4 | no-enumeración | mismo código de error que #2 y #3 |
| 5 | hash alterado en la decisión | rechazo |
| 6 | rechazo total | se registra |
| 7 | doble submit | rechazo |
| 8 | replay tras decidir | rechazo |
| 9 | autorización parcial | 1 aceptada, 1 rechazada, `partially_accepted` |
| 10 | reemisión | v1 queda `revoked` |
| 11 | token v1 tras reemisión | rechazo |
| 12 | token v2 | sirve |
| 13 | token bajo otra organización declarada | mismo caso (el token es la autoridad) |
| 14 | Taller Demo sobre caso de DTEK | rechazo |
| 15 | soporte sin elevación escribiendo | rechazo |

Existe porque `pnpm test:e2e` **no puede correr en esta máquina**: la política
de Application Control de Windows bloquea el Chromium de Playwright. Un
escenario que no se puede ejecutar no se puede declarar verificado, así que
estos se ejecutan por otra vía en lugar de darse por buenos.

**Lo que prueba y lo que no.** Prueba el comportamiento de la capa de
aplicación end-to-end sobre HTTP real. **No** prueba RLS de Postgres: el
motor es in-memory, así que el aislamiento observado es el de la aplicación.
El aislamiento a nivel de base de datos sigue siendo
`implemented_pending_environment_evidence` hasta que corran los pgTAP.

---

## 4. Cuando exista Docker Desktop

```bash
pnpm db:reset   # migraciones 0000–0090 + supabase/seeds/*.sql
pnpm test:db    # contrato estático (hoy) + pgTAP real (nuevo)
pnpm test:e2e   # Playwright, si la política de Windows lo permite
```

`scripts/db-stub.mjs` hoy imprime un aviso honesto en vez de invocar el
Supabase CLI. Reemplazarlo por `supabase db reset` es el único cambio
necesario para que las capas 1 y 2 dejen de estar pendientes de entorno.

---

## Credenciales

Todas las credenciales de este repositorio son **demo local**. La contraseña
de los actores seed (`datatek-local-dev-only`) sólo es válida contra una
instancia de Supabase Auth local y no se reutiliza en ningún otro lado. No
hay ninguna URL ni clave productiva en el árbol; `pnpm test:legacy` lo
verifica y falla si aparece una.
