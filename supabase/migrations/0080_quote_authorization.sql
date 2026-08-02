-- Datatek — migración 0080: cotización y autorización (R0-D Fase 3, ola `0080`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0020/0030/0040/0050/0060/0070 (ver sus cabeceras). Esta
-- sandbox no tiene Docker Desktop ni Supabase CLI ejecutable localmente
-- (ver docs/runbooks/database-reset.md). El SQL es completo y se considera
-- correcto por revisión estática + el motor de comandos en memoria
-- (packages/application/src/commands/quote-commands.ts,
-- authorization-commands.ts) que implementa exactamente estas mismas
-- invariantes contra `supabase/tests/*.sql` de una fase futura, pero su
-- ejecución contra Postgres real queda como
-- `implemented_pending_environment_evidence` hasta que una sesión futura
-- con Docker corra `pnpm db:reset && pnpm test:db`.
--
-- NOTA HONESTA: a diferencia de 0010–0070, esta ola NO trae su propio
-- archivo pgTAP en `supabase/tests/0080_quote_authorization.sql` todavía —
-- el alcance explícito de R0-D Fase 3 pidió schema/constraints/índices/
-- RLS/grants completos y correctos más pruebas de dominio en TypeScript,
-- no pgTAP. Escribir `supabase/tests/0080_quote_authorization.sql` sigue
-- la misma plantilla que 0070 y queda como trabajo pendiente explícito,
-- no silencioso (ver docs/domain/authorization-security.md).
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección
-- 11 (Quote) y 12 (Authorization request y enlace);
-- DATATEK_R0_A_CONTRACT_PACK.md sección 4.9 (8 tablas), sección 5.4
-- (estados de quote version), sección 5.5 (estados de authorization
-- request), sección 5.6 (estados de autorización), sección 9 completa
-- (dinero/líneas, freeze, solicitud, decisión por línea), sección 10
-- completa (contrato de seguridad de `/a/[token]`).
--
-- Diseño — freeze inmutable reforzado en dos capas (sección 9.2: "Postgres
-- impide la edición y la carrera concurrente; TypeScript valida y
-- presenta, pero no es la única defensa"):
--   1. `quote_items` lleva un trigger BEFORE INSERT/UPDATE/DELETE que
--      revisa el estado de su `quote_versions` dueño y rechaza cualquier
--      mutación si esa versión ya no es 'draft' — esto es lo que hace que
--      "cualquier intento de editar una versión frozen falla" sea cierto
--      incluso si algún día una ruta HTTP se salta la capa de aplicación.
--   2. `quote_versions` lleva un trigger BEFORE UPDATE que, una vez
--      `frozen_at` está fijado, congela también los campos económicos
--      (snapshot_hash, snapshot_json, subtotal_minor, total_minor,
--      currency, quote_id, case_id, version_number, frozen_at, frozen_by)
--      — solo `status`/`superseded_*`/`voided_*` pueden seguir cambiando
--      después de ese punto (el camino frozen -> superseded/voided).
--
-- Diseño — token de acceso (sección 10.2): `authorization_access_tokens`
-- guarda ÚNICAMENTE `token_hash` (sha256 hex del secreto aleatorio); el
-- secreto en claro nunca toca esta base. La fila `id` de esta tabla es el
-- componente PÚBLICO del token que la aplicación entrega como
-- `${id}.${secreto}` — permite ubicar la fila correcta (y por lo tanto
-- incrementar attempt_count) incluso cuando el secreto adivinado es
-- incorrecto, que es justamente lo que hace cumplible el límite de 5
-- intentos (ver docs/domain/authorization-security.md). Esta tabla no
-- recibe ningún `grant select` para `authenticated` — ni siquiera el hash
-- debe ser legible por un cliente autenticado normal; toda verificación
-- pasa por una función/ruta de aplicación con Service Role (sección 10.2:
-- "nunca aparece en logs, eventos o analytics").
--
-- Diseño — actor de una autorización: una decisión puede venir de un
-- cliente sin cuenta (secure_link), un cliente con cuenta vinculada
-- (pass_authenticated) o de un miembro de staff registrando en nombre del
-- cliente por teléfono (staff_manual — permiso `authorization.decide`).
-- Los dos primeros casos identifican al actor por `customers.id`, el
-- tercero por `auth.users.id` — por eso `authorizations` separa
-- `decided_by_customer_id` y `decided_by_user_id` en vez de una sola
-- columna `actor_id uuid references auth.users(id)`, que sería una FK
-- incorrecta para los dos primeros métodos.

-- ===========================================================================
-- 1. quotes
-- ===========================================================================

create table quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  unique (id, organization_id)
);

comment on table quotes is
  'Cotización lógica que agrupa versiones (sección 11). Sin lifecycle propio — el estado vive en quote_versions (sección 5.4).';

create index quotes_org_idx on quotes (organization_id);
create index quotes_case_idx on quotes (case_id);

-- ===========================================================================
-- 2. quote_versions
-- ===========================================================================

create table quote_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  quote_id uuid not null,
  case_id uuid not null,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft', 'frozen', 'superseded', 'voided')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- bigint en unidades menores (sección 4.14: "Dinero como bigint en
  -- unidades menores + moneda ISO"). Siempre recalculado desde quote_items
  -- por FreezeQuoteVersion — nunca aceptado tal cual del cliente.
  subtotal_minor bigint not null default 0 check (subtotal_minor >= 0),
  total_minor bigint not null default 0 check (total_minor >= 0),
  snapshot_hash text check (snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$'),
  snapshot_json jsonb,
  frozen_at timestamptz,
  frozen_by uuid references auth.users (id),
  superseded_at timestamptz,
  superseded_by_version_id uuid references quote_versions (id),
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (quote_id, organization_id) references quotes (id, organization_id) on delete cascade,
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  unique (quote_id, version_number),
  unique (id, organization_id),
  -- Draft nunca tiene campos de freeze; frozen/superseded/voided siempre
  -- los conserva (freeze es un evento que ocurre una sola vez en la vida
  -- de una fila — superseded/voided son estados posteriores AL freeze, no
  -- lo deshacen).
  check (
    (status = 'draft' and frozen_at is null and snapshot_hash is null and snapshot_json is null)
    or (
      status in ('frozen', 'superseded', 'voided')
      and frozen_at is not null and snapshot_hash is not null and snapshot_json is not null
    )
  ),
  check ((superseded_at is null) = (superseded_by_version_id is null)),
  check ((superseded_at is not null) = (status = 'superseded')),
  check (status <> 'voided' or (voided_at is not null and voided_reason is not null)),
  check (superseded_by_version_id is null or superseded_by_version_id <> id)
);

comment on table quote_versions is
  'Versión con lifecycle draft/frozen/superseded/voided (sección 5.4). Freeze es una operación de una sola vía por fila — ver los triggers de inmutabilidad más abajo.';

create index quote_versions_quote_idx on quote_versions (quote_id);
create index quote_versions_case_idx on quote_versions (case_id);
create index quote_versions_org_status_idx on quote_versions (organization_id, status);

-- ===========================================================================
-- 3. quote_items
-- ===========================================================================

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_version_id uuid not null,
  line_type text not null check (line_type in ('service', 'part', 'labor', 'fee')),
  description text not null check (btrim(description) <> ''),
  -- Cantidad decimal con escala explícita (sección 4.14: "cantidades
  -- decimales con escala explícita; nunca float") — numeric, no float8.
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_minor bigint not null check (total_minor >= 0),
  visibility text not null default 'customer' check (visibility in ('internal', 'customer', 'shared_case')),
  requires_authorization boolean not null default true,
  source_type text check (source_type is null or source_type in ('finding', 'recommendation', 'catalog_item', 'manual')),
  source_id uuid,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  foreign key (quote_version_id, organization_id) references quote_versions (id, organization_id) on delete cascade,
  unique (id, organization_id)
);

comment on table quote_items is
  'Línea de cotización — sección 9.1. Inmutable una vez la quote_version dueña deja de ser draft (trigger quote_items_check_draft más abajo), no solo por convención de aplicación.';

create trigger quote_items_set_updated_at
  before update on quote_items
  for each row execute function datatek_platform.set_updated_at();

create index quote_items_version_idx on quote_items (quote_version_id);
create index quote_items_org_idx on quote_items (organization_id);

-- ===========================================================================
-- 4. authorization_requests
-- ===========================================================================

create table authorization_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null,
  quote_version_id uuid not null,
  audience_customer_id uuid not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'sent', 'viewed', 'decided', 'expired', 'revoked')),
  allowed_methods text[] not null default array['secure_link']::text[]
    check (allowed_methods <@ array['pass_authenticated', 'secure_link']::text[] and cardinality(allowed_methods) > 0),
  expires_at timestamptz not null,
  prepared_at timestamptz not null default now(),
  prepared_by uuid references auth.users (id),
  sent_at timestamptz,
  sent_by uuid references auth.users (id),
  sent_channel text,
  sent_result text check (sent_result is null or sent_result in ('sent', 'failed')),
  viewed_at timestamptz,
  decided_at timestamptz,
  -- FK a authorizations agregada más abajo vía ALTER TABLE — authorizations
  -- todavía no existe en este punto del archivo (referencia circular).
  authorization_id uuid,
  revoked_at timestamptz,
  revoked_reason text,
  superseded_by_quote_version_id uuid references quote_versions (id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (quote_version_id, organization_id) references quote_versions (id, organization_id),
  foreign key (audience_customer_id, organization_id) references customers (id, organization_id),
  unique (id, organization_id),
  check (status <> 'sent' or sent_at is not null),
  check (status <> 'decided' or (decided_at is not null and authorization_id is not null)),
  check (status <> 'revoked' or (revoked_at is not null and revoked_reason is not null))
);

comment on table authorization_requests is
  'Solicitud de autorización — sección 5.5. Solo referencia una quote_version frozen (validado en la capa de aplicación al preparar; ver quote-commands.ts/authorization-commands.ts). Enviar es un evento distinto de freeze (sección 9.3).';

create index authorization_requests_org_idx on authorization_requests (organization_id);
create index authorization_requests_case_idx on authorization_requests (case_id);
create index authorization_requests_version_idx on authorization_requests (quote_version_id);
create index authorization_requests_pending_idx
  on authorization_requests (quote_version_id)
  where status in ('prepared', 'sent', 'viewed');

-- ===========================================================================
-- 5. authorization_access_tokens
-- ===========================================================================
-- Ver nota de diseño en la cabecera del archivo. Esta tabla NO recibe
-- `grant select` para `authenticated` en la sección de RLS/grants — con RLS
-- activada y forzada y sin ninguna policy, el acceso normal queda denegado
-- por defecto; solo Service Role (o una función SECURITY DEFINER futura y
-- estrecha) puede leerla.

create table authorization_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  authorization_request_id uuid not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  scope text not null check (scope in ('read', 'read_and_decide')),
  audience_customer_id uuid not null,
  verification_method text not null check (btrim(verification_method) <> ''),
  expires_at timestamptz not null,
  verified_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  locked_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  nonce text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  foreign key (authorization_request_id, organization_id)
    references authorization_requests (id, organization_id) on delete cascade,
  foreign key (audience_customer_id, organization_id) references customers (id, organization_id),
  unique (id, organization_id),
  unique (token_hash),
  check (attempt_count <= max_attempts)
);

comment on table authorization_access_tokens is
  'Sección 10.2, literal: solo se guarda el hash. `id` es el componente PÚBLICO del token entregado como "${id}.${secreto}" — permite localizar la fila (y por tanto contar intentos) incluso con un secreto incorrecto. max_attempts=5 (SECURITY_SPEC.authorization_token_max_attempts). Sin policy de select para authenticated — ver cabecera del archivo.';

create index authorization_access_tokens_request_idx on authorization_access_tokens (authorization_request_id);
create index authorization_access_tokens_org_idx on authorization_access_tokens (organization_id);

-- ===========================================================================
-- 6. authorizations
-- ===========================================================================

create table authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null,
  authorization_request_id uuid not null,
  quote_version_id uuid not null,
  quote_version_hash text not null check (quote_version_hash ~ '^[0-9a-f]{64}$'),
  status text not null check (status in ('accepted', 'partially_accepted', 'rejected', 'invalidated')),
  audience_customer_id uuid not null,
  method text not null check (method in ('secure_link', 'pass_authenticated', 'staff_manual')),
  -- Ver nota de diseño en la cabecera: dos columnas de actor porque un
  -- decisor por token/Pass es un `customers.id`, no un `auth.users.id`.
  decided_by_customer_id uuid,
  decided_by_user_id uuid references auth.users (id),
  rejection_reason text,
  decided_at timestamptz not null,
  invalidated_at timestamptz,
  invalidated_reason text,
  invalidated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (authorization_request_id, organization_id)
    references authorization_requests (id, organization_id),
  foreign key (quote_version_id, organization_id) references quote_versions (id, organization_id),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (audience_customer_id, organization_id) references customers (id, organization_id),
  foreign key (decided_by_customer_id, organization_id) references customers (id, organization_id),
  -- Exactamente una solicitud produce, como mucho, una autorización — una
  -- nueva decisión sobre contenido cambiado exige una nueva solicitud/
  -- versión (sección 5.6), nunca una segunda fila sobre la misma request.
  unique (authorization_request_id),
  unique (id, organization_id),
  check (
    (method = 'staff_manual' and decided_by_user_id is not null and decided_by_customer_id is null)
    or (method <> 'staff_manual' and decided_by_customer_id is not null and decided_by_user_id is null)
  ),
  check (status <> 'invalidated' or (invalidated_at is not null and invalidated_reason is not null)),
  check (status <> 'rejected' or rejection_reason is not null)
);

comment on table authorizations is
  'Decisión — append-only (sección 5.6). invalidated no borra nada: agrega invalidated_at/reason sobre la MISMA fila, que conserva su status/method/decided_at originales en el historial (ver authorization_items, que tampoco se toca).';

alter table authorization_requests
  add constraint authorization_requests_authorization_fk
  foreign key (authorization_id, organization_id) references authorizations (id, organization_id);

create index authorizations_org_idx on authorizations (organization_id);
create index authorizations_case_idx on authorizations (case_id);
create index authorizations_version_idx on authorizations (quote_version_id);

-- ===========================================================================
-- 7. authorization_items
-- ===========================================================================

create table authorization_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  authorization_id uuid not null,
  quote_version_id uuid not null,
  quote_item_id uuid not null,
  -- Snapshot por línea al momento de decidir — NUNCA una referencia viva a
  -- quote_items (sección 9.4: "snapshot de descripción, cantidad, precio,
  -- moneda y términos").
  description_snapshot text not null,
  quantity_snapshot numeric(12, 3) not null check (quantity_snapshot > 0),
  unit_price_minor_snapshot bigint not null check (unit_price_minor_snapshot >= 0),
  currency_snapshot text not null check (currency_snapshot ~ '^[A-Z]{3}$'),
  decision text not null check (decision in ('accepted', 'rejected')),
  accepted_quantity numeric(12, 3) check (accepted_quantity is null or accepted_quantity > 0),
  rejection_reason text,
  decided_at timestamptz not null,
  foreign key (authorization_id, organization_id) references authorizations (id, organization_id) on delete cascade,
  foreign key (quote_version_id, organization_id) references quote_versions (id, organization_id),
  foreign key (quote_item_id, organization_id) references quote_items (id, organization_id),
  unique (authorization_id, quote_item_id),
  check ((decision = 'accepted') = (accepted_quantity is not null))
);

comment on table authorization_items is
  'Decisión por línea (sección 9.4). Una autorización parcial se lee reconstruyendo qué líneas quedaron accepted vs rejected en esta tabla — nunca un array suelto en la fila padre.';

create index authorization_items_authorization_idx on authorization_items (authorization_id);
create index authorization_items_org_idx on authorization_items (organization_id);

-- ===========================================================================
-- 8. authorization_events
-- ===========================================================================
-- Append-only (sección 5.7: "no se escriben cuatro payloads independientes
-- sin correlación" — este es el evento especializado de la vertical de
-- autorización, correlacionado por authorization_request_id/
-- authorization_id, análogo a case_status_events para el caso).

create table authorization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  authorization_request_id uuid not null,
  authorization_id uuid,
  -- 'revoked' added in R0-D Fase 4a for `RevokeAndReprepareAuthorizationRequest`
  -- (packages/application/src/commands/authorization-commands.ts) — distinct
  -- from 'superseded' (a NEW quote version made the request stale): 'revoked'
  -- means the SAME frozen version is still valid but staff manually killed
  -- this request/token pair to reissue a fresh one.
  event_type text not null check (
    event_type in ('prepared', 'sent', 'send_failed', 'viewed', 'access_denied', 'decided', 'invalidated', 'superseded', 'revoked')
  ),
  -- Nunca el secreto del token ni ningún dato sensible (sección 10.2).
  details jsonb not null default '{}'::jsonb,
  -- Nullable a propósito: una decisión guest (secure_link) no tiene
  -- auth.users.id — igual que authorizations.decided_by_user_id. El actor
  -- real de un evento guest se reconstruye desde el `authorization`/
  -- `authorization_access_tokens` correlacionados, no desde esta columna.
  actor_id uuid references auth.users (id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (authorization_request_id, organization_id)
    references authorization_requests (id, organization_id) on delete cascade,
  foreign key (authorization_id, organization_id) references authorizations (id, organization_id),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade
);

comment on table authorization_events is
  'Historial append-only de la vertical de autorización, para timeline compartido Pro/Pass (sección 13). Nunca se actualiza ni se borra una fila.';

create index authorization_events_request_idx on authorization_events (authorization_request_id, occurred_at);
create index authorization_events_case_idx on authorization_events (case_id, occurred_at);

-- ===========================================================================
-- 9. Triggers de inmutabilidad — freeze real, no solo de aplicación
-- ===========================================================================
-- Sección 9.2: "Postgres impide la edición y la carrera concurrente".

create function datatek_platform.quote_items_check_draft()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_version_id uuid;
begin
  v_version_id := coalesce(new.quote_version_id, old.quote_version_id);
  select status into v_status from quote_versions where id = v_version_id;

  if v_status is null then
    raise exception 'quote_version % no existe', v_version_id using errcode = '23503';
  end if;

  if v_status <> 'draft' then
    raise exception 'quote_items es inmutable una vez la versión dueña deja de ser draft (estado actual: %)', v_status
      using errcode = '23514';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function datatek_platform.quote_items_check_draft() is
  'Segunda capa de "draft editable; frozen inmutable" (sección 9.2) — independiente de que la aplicación olvide el chequeo.';

create trigger quote_items_check_draft_ins_upd_del
  before insert or update or delete on quote_items
  for each row execute function datatek_platform.quote_items_check_draft();

create function datatek_platform.quote_versions_check_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Antes del freeze (old.frozen_at is null) cualquier columna puede
  -- cambiar libremente — este es el camino draft normal, incluido el
  -- freeze mismo (draft -> frozen fija frozen_at por primera vez).
  if old.frozen_at is null then
    return new;
  end if;

  -- Después del freeze: los campos económicos y de identidad quedan
  -- fijos para siempre. Solo status (frozen -> superseded/voided) y los
  -- campos de superseded_*/voided_* pueden seguir moviéndose.
  if new.snapshot_hash is distinct from old.snapshot_hash
    or new.snapshot_json is distinct from old.snapshot_json
    or new.subtotal_minor is distinct from old.subtotal_minor
    or new.total_minor is distinct from old.total_minor
    or new.currency is distinct from old.currency
    or new.quote_id is distinct from old.quote_id
    or new.case_id is distinct from old.case_id
    or new.version_number is distinct from old.version_number
    or new.frozen_at is distinct from old.frozen_at
    or new.frozen_by is distinct from old.frozen_by
  then
    raise exception 'quote_versions % ya está frozen — los campos económicos y de identidad son inmutables (sección 9.2)', old.id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function datatek_platform.quote_versions_check_immutable() is
  'Una vez frozen_at está fijado, ningún UPDATE puede alterar snapshot_hash/snapshot_json/subtotal_minor/total_minor/currency/quote_id/case_id/version_number/frozen_at/frozen_by. status/superseded_*/voided_* siguen mutables (camino frozen -> superseded/voided).';

create trigger quote_versions_check_immutable
  before update on quote_versions
  for each row execute function datatek_platform.quote_versions_check_immutable();

-- ===========================================================================
-- 10. RLS + grants
-- ===========================================================================
-- Mismo principio que 0020–0070: RLS habilitada y forzada en cada tabla;
-- ninguna policy de insert/update/delete para `authenticated` — toda
-- mutación pasa por un comando de aplicación con Service Role. Lectura:
-- staff con quote.read/authorization.request/authorization.decide ve todo
-- lo de su organización; un cliente vinculado ve solo lo de su propio
-- caso; soporte elevado ve dentro de su sesión activa.
--
-- authorization_access_tokens es la ÚNICA excepción de esta ola sin
-- ninguna policy de select — ver la nota de diseño en la cabecera del
-- archivo y en su comentario de tabla.

revoke all on quotes, quote_versions, quote_items, authorization_requests,
  authorization_access_tokens, authorizations, authorization_items, authorization_events
  from public, anon, authenticated;

alter table quotes enable row level security;
alter table quote_versions enable row level security;
alter table quote_items enable row level security;
alter table authorization_requests enable row level security;
alter table authorization_access_tokens enable row level security;
alter table authorizations enable row level security;
alter table authorization_items enable row level security;
alter table authorization_events enable row level security;

alter table quotes force row level security;
alter table quote_versions force row level security;
alter table quote_items force row level security;
alter table authorization_requests force row level security;
alter table authorization_access_tokens force row level security;
alter table authorizations force row level security;
alter table authorization_items force row level security;
alter table authorization_events force row level security;

grant select on quotes to authenticated;
grant select on quote_versions to authenticated;
grant select on quote_items to authenticated;
grant select on authorization_requests to authenticated;
-- (sin grant sobre authorization_access_tokens — a propósito)
grant select on authorizations to authenticated;
grant select on authorization_items to authenticated;
grant select on authorization_events to authenticated;

create policy quotes_select on quotes
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'quote.read')
    or exists (
      select 1 from cases c
      where c.id = quotes.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy quote_versions_select on quote_versions
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'quote.read')
    or exists (
      select 1 from cases c
      where c.id = quote_versions.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy quote_items_select on quote_items
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'quote.read')
    or exists (
      select 1 from quote_versions v
      join cases c on c.id = v.case_id
      where v.id = quote_items.quote_version_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy authorization_requests_select on authorization_requests
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'authorization.request')
    or datatek_platform.has_org_permission(organization_id, 'authorization.decide')
    or datatek_platform.actor_is_linked_customer(audience_customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy authorizations_select on authorizations
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'authorization.decide')
    or datatek_platform.has_org_permission(organization_id, 'quote.read')
    or datatek_platform.actor_is_linked_customer(audience_customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy authorization_items_select on authorization_items
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'authorization.decide')
    or datatek_platform.has_org_permission(organization_id, 'quote.read')
    or exists (
      select 1 from authorizations a
      where a.id = authorization_items.authorization_id
        and datatek_platform.actor_is_linked_customer(a.audience_customer_id, a.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy authorization_events_select on authorization_events
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'authorization.request')
    or datatek_platform.has_org_permission(organization_id, 'authorization.decide')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated` o `anon`:
-- toda mutación pasa por un comando de aplicación ejecutado con Service
-- Role (sección 6.1 R0-C, repetido en cada ola desde 0020).
