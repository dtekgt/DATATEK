-- Datatek — migración 0085: confianza transaccional (R0-D Fase 4a, ola `0085`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0000–0080 (ver sus cabeceras). Esta sandbox no tiene Docker
-- Desktop ni Supabase CLI ejecutable localmente (ver
-- docs/runbooks/database-reset.md). El SQL es completo y se considera
-- correcto por revisión estática; su ejecución contra Postgres real queda
-- como `implemented_pending_environment_evidence` hasta que una sesión
-- futura con Docker corra `pnpm db:reset && pnpm test:db`.
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 1
-- (tabla de olas: "0085: eventos, auditoría, outbox, idempotencia") y
-- sección 14 completa (Outbox e idempotencia);
-- DATATEK_R0_A_CONTRACT_PACK.md sección 4.10 (4 tablas) y sección 4.13
-- ("outbox_messages -> domain_event: instrucción asíncrona idempotente").
--
-- NOTA HONESTA — no es un concepto nuevo, es el modelo SQL de algo que R0-D
-- Fase 1-3 ya construyó dentro del motor de fixtures en memoria:
-- `appendAuditEvent`/`AuditEventRecord` y
-- `appendIdempotencyRecord`/`findIdempotentReplay`/`IdempotencyRecord`
-- (packages/application/src/commands/state.ts) son exactamente
-- `audit_events`/`idempotency_keys` de esta migración, campo por campo. Esta
-- ola no cambia ese motor — sigue operando sobre las listas en memoria; lo
-- que agrega es el schema real que una fase futura con Postgres alcanzable
-- usaría para lo mismo.
--
-- `domain_events`/`outbox_messages` SÍ son conceptos nuevos en esta ola (no
-- tienen equivalente en el motor de fixtures todavía) — sección 14 pide
-- explícitamente que R0 NO implemente un worker real ni Supabase Queues
-- ("R0 no agrega Supabase Queues. En R2, un dispatcher explícito podrá mover
-- outbox -> queue"), así que esta migración deja el schema completo
-- (columnas de lock/lease, intentos, próximo intento, error sanitizado,
-- estado dead/archived) sin ningún proceso que lo lea o escriba todavía —
-- exactamente como `case_blockers`/`resource_schedules`/`capacity_blocks`
-- quedaron en 0060 (ver docs/domain/unwritten-tables.md): tabla real,
-- escritor diferido, documentado como tal, no como vacío accidental.
--
-- Diseño — domain_events es append-only y nunca se actualiza ni se borra
-- (mismo principio que `authorization_events`/`case_status_events`): cada
-- fila es un hecho de negocio ya ocurrido (freeze, autorización decidida,
-- caso creado, etc.), correlacionado por `correlation_id`/`causation_id`
-- para reconstruir una cadena causal completa sin adivinar orden por
-- timestamp. `outbox_messages` referencia el domain_event que la originó —
-- nunca se inserta un mensaje de outbox sin su evento de dominio detrás
-- (sección 14: "outbox_messages como fuente transaccional").

-- ===========================================================================
-- 1. domain_events
-- ===========================================================================

create table domain_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  event_type text not null check (btrim(event_type) <> ''),
  -- Qué fila de negocio generó el hecho — p. ej. ('case', case_id),
  -- ('quote_version', quote_version_id), ('authorization_request', ...).
  -- Sin FK física a una tabla específica (el aggregate varía por evento);
  -- la corrección referencial la garantiza la capa de aplicación que
  -- escribe la fila, igual que `authorization_events.details` no tiene FK a
  -- lo que describe.
  aggregate_type text not null check (btrim(aggregate_type) <> ''),
  aggregate_id uuid not null,
  correlation_id uuid not null,
  -- El evento/comando que causó este evento, cuando aplica — permite
  -- reconstruir una cadena causal (p. ej. RecordAuthorization causó
  -- 'authorization.decided' que a su vez encola un outbox message).
  causation_id uuid,
  -- Nunca datos sensibles de seguridad (mismo principio que
  -- authorization_events.details, sección 10.2) — solo lo necesario para
  -- proyectar timeline/outbox.
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users (id),
  -- Un actor guest (secure_link) no tiene auth.users.id — igual que
  -- authorizations.decided_by_customer_id/authorization_events.actor_id.
  actor_customer_id uuid,
  schema_version integer not null default 1 check (schema_version > 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (actor_customer_id, organization_id) references customers (id, organization_id),
  unique (id, organization_id)
);

comment on table domain_events is
  'Log append-only de hechos de negocio — sección 14. Fuente para outbox_messages y para un futuro proyector de timeline unificado; nunca se actualiza ni se borra una fila.';

create index domain_events_org_occurred_idx on domain_events (organization_id, occurred_at);
create index domain_events_aggregate_idx on domain_events (aggregate_type, aggregate_id);
create index domain_events_correlation_idx on domain_events (correlation_id);

-- ===========================================================================
-- 2. outbox_messages
-- ===========================================================================
-- R0 NO implementa el worker que consume esta tabla (sección 14: "R0 no
-- agrega Supabase Queues"). El schema completo existe para que R2 no
-- necesite migrar el modelo, solo escribir el dispatcher.

create table outbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  domain_event_id uuid not null,
  -- p. ej. 'notify.customer.authorization_prepared',
  -- 'notify.customer.authorization_reissued' — nunca un canal real en R0
  -- (sección 12: "no envía un mensaje real").
  message_type text not null check (btrim(message_type) <> ''),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  next_attempt_at timestamptz not null default now(),
  -- Lock/lease de un worker futuro (sección 14: "lock/lease; intentos;
  -- próximo intento"). Ninguna fila de R0 los usa todavía.
  locked_at timestamptz,
  locked_by text,
  -- Mensaje de error SANITIZADO — nunca un stack trace crudo ni datos
  -- sensibles (sección 14: "error sanitizado").
  last_error text,
  -- Dedupe por (organization_id, idempotency_key) — "comandos idempotentes
  -- mínimos" de sección 14 (crear caso, reservar/agendar, confirmar upload,
  -- freeze quote, preparar request, registrar decisión) escriben aquí con
  -- una key derivada del comando que los originó.
  idempotency_key text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (domain_event_id, organization_id) references domain_events (id, organization_id) on delete cascade,
  unique (organization_id, idempotency_key),
  check (attempts <= max_attempts),
  check (status <> 'sent' or locked_at is not null or attempts > 0)
);

comment on table outbox_messages is
  'Fuente transaccional de instrucciones asíncronas idempotentes (sección 14). Sin worker real en R0 — columnas de lock/lease/intentos existen para el dispatcher de R2, sin proceso que las use todavía.';

create trigger outbox_messages_set_updated_at
  before update on outbox_messages
  for each row execute function datatek_platform.set_updated_at();

create index outbox_messages_org_idx on outbox_messages (organization_id);
create index outbox_messages_pending_idx
  on outbox_messages (next_attempt_at)
  where status in ('pending', 'processing');
create index outbox_messages_event_idx on outbox_messages (domain_event_id);

-- ===========================================================================
-- 3. audit_events
-- ===========================================================================
-- Espejo SQL de `AuditEventRecord`/`appendAuditEvent` en
-- packages/application/src/commands/state.ts — mismos campos, mismo
-- propósito: un registro humano-legible de "qué comando corrió, quién, con
-- qué resultado resumido", separado de domain_events (hechos de negocio
-- estructurados para replay/outbox) y de los eventos especializados por
-- vertical (case_status_events, authorization_events).

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor_id uuid references auth.users (id),
  correlation_id uuid not null,
  command_name text not null check (btrim(command_name) <> ''),
  summary text not null check (btrim(summary) <> ''),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table audit_events is
  'Espejo SQL de AuditEventRecord (commands/state.ts) — un registro por comando ejecutado, legible por humanos, para audit.read_organization. Append-only.';

create index audit_events_org_occurred_idx on audit_events (organization_id, occurred_at);
create index audit_events_command_idx on audit_events (organization_id, command_name);

-- ===========================================================================
-- 4. idempotency_keys
-- ===========================================================================
-- Espejo SQL de `IdempotencyRecord`/`appendIdempotencyRecord`/
-- `findIdempotentReplay` en commands/state.ts. Clave primaria compuesta
-- exactamente igual a la búsqueda de replay que ese código ya hace:
-- (organization_id, command_name, key).

create table idempotency_keys (
  organization_id uuid not null references organizations (id) on delete cascade,
  command_name text not null,
  key text not null check (btrim(key) <> ''),
  -- Snapshot serializable del resultado exitoso — reproducido tal cual en
  -- un reintento con la misma clave, nunca se re-ejecuta el comando.
  result_summary jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, command_name, key)
);

comment on table idempotency_keys is
  'Espejo SQL de IdempotencyRecord (commands/state.ts). Un reintento con la misma (organization_id, command_name, key) se sirve desde result_summary sin re-ejecutar el comando.';

-- ===========================================================================
-- 5. RLS + grants
-- ===========================================================================
-- domain_events/audit_events: legibles por staff con audit.read_organization
-- o soporte elevado activo — mismo patrón que authorization_events_select en
-- 0080. outbox_messages/idempotency_keys son ÚNICAMENTE de orquestación
-- interna (mismo principio que authorization_access_tokens en 0080): sin
-- ninguna policy de select para `authenticated` — con RLS activada y
-- forzada y sin policy, el acceso normal queda denegado por defecto; solo
-- Service Role puede leerlas.

revoke all on domain_events, outbox_messages, audit_events, idempotency_keys
  from public, anon, authenticated;

alter table domain_events enable row level security;
alter table outbox_messages enable row level security;
alter table audit_events enable row level security;
alter table idempotency_keys enable row level security;

alter table domain_events force row level security;
alter table outbox_messages force row level security;
alter table audit_events force row level security;
alter table idempotency_keys force row level security;

grant select on domain_events to authenticated;
grant select on audit_events to authenticated;
-- (sin grant sobre outbox_messages/idempotency_keys — a propósito)

create policy domain_events_select on domain_events
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'audit.read_organization')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy audit_events_select on audit_events
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'audit.read_organization')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated` o `anon`:
-- toda mutación pasa por un comando de aplicación ejecutado con Service
-- Role (sección 6.1 R0-C, repetido en cada ola desde 0020).
