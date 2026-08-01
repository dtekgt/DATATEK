# ADR 0002 — Tenancy en filas + RLS, no un schema por tenant

**Estado:** aceptado
**Fecha:** 2026-08-01
**Contexto:** R0-C, identidad/tenancy/aislamiento

## Contexto

DATATEK_R0_C exige que "una sesión de DTEK no pueda leer ni mutar datos de
Taller Demo, incluso si conoce UUID, slug, VIN, correo, teléfono o folio"
(sección 0). El sistema necesita soportar un número creciente de talleres
(organizations) sin que agregar uno implique una migración de
infraestructura.

## Decisión

Tenancy por fila (row-level multi-tenancy), no por schema ni por base de
datos separada:

- toda tabla de negocio (a partir de R0-D) lleva `organization_id uuid not
  null references organizations(id)`;
- **RLS obligatoria en cada tabla expuesta** (migración `0010` sección 6.1),
  activada con `force row level security` para que ni el dueño de la tabla
  quede exento;
- el aislamiento se aplica en la capa de datos, no solo en la aplicación:
  aunque un bug de la aplicación olvide filtrar por `organization_id`, RLS
  sigue devolviendo cero filas para otro tenant;
- helpers `security definer` en el schema `datatek_platform`
  (`has_active_org_membership`, `effective_org_permissions`,
  `org_branch_scope_allows`, `has_active_platform_membership`,
  `has_active_support_session`) resuelven membership/capacidad sin
  recursión de políticas y con `search_path` fijo;
- ningún grant de `insert`/`update`/`delete` directo para `authenticated`;
  toda mutación sensible pasa por un comando de aplicación ejecutado con
  Service Role (nunca expuesto al navegador).

## Alternativas consideradas

- **Un schema Postgres por organización:** rechazado. Escala mal (cientos de
  talleres → cientos de schemas), complica migraciones (aplicar `0011` a N
  schemas en vez de 1) y no elimina el riesgo de fuga — solo lo mueve de
  "WHERE faltante" a "schema equivocado en la connection string".
- **Una base de datos por organización:** rechazado por el mismo motivo,
  agravado: backups, pooling de conexiones y observabilidad se multiplican
  por tenant sin beneficio de aislamiento adicional frente a RLS bien
  probada.
- **Aislamiento solo en la capa de aplicación (sin RLS):** rechazado. Un solo
  `WHERE organization_id = ?` olvidado en un query filtraría datos entre
  tenants sin que ninguna prueba unitaria de aplicación lo detecte
  necesariamente; RLS es la última línea de defensa exigida explícitamente
  por la sección 6.1.

## Consecuencias

- Cada nueva tabla de negocio en R0-D+ debe nacer con su propia RLS, grants e
  índice de `organization_id` en la misma ola que la tabla (ley 27); no hay
  "agregar seguridad después".
- Las pruebas de aislamiento (`supabase/tests/0010_identity_tenancy.sql`)
  corren como el propio rol `authenticated` con un JWT simulado por actor,
  no como superusuario — reproducen exactamente lo que Supabase PostgREST
  vería en producción.
- Elevación de soporte (`support_access_sessions`) es la única forma de que
  un actor de plataforma lea contenido tenant, y expira — no existe bypass
  de tenant permanente ni "modo dios" implícito por rol de plataforma.
- El costo de este modelo es que cada política RLS debe revisarse con
  cuidado (una condición `OR` mal puesta filtra datos); se acepta ese costo
  porque es auditable en una sola migración por tabla, a diferencia de
  aislamiento distribuido entre N schemas/bases.
