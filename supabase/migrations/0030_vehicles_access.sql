-- Datatek — migración 0030: vehículos y acceso (R0-D Fase 1, ola `0030`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0020 (ver su cabecera). `implemented_pending_environment_evidence`
-- hasta `pnpm db:reset && pnpm test:db` con Docker disponible.
--
-- Fuente normativa: DATATEK_R0_D sección 5 (Vehículo) y R0-A sección 4.4
-- (6 tablas), 4.13, 4.14.
--
-- ===========================================================================
-- Diseño: vehículos son globales, el acceso es local
-- ===========================================================================
-- `vehicles`/`vehicle_identifiers` NO tienen `organization_id`. Un VIN o
-- placa nombra un vehículo físico único independientemente de a qué taller
-- visite a lo largo de su vida — por eso "una coincidencia no confirma
-- propietario" y "fusión de duplicados queda para Control" tienen sentido:
-- ambas reglas asumen que el mismo vehículo puede ser legítimamente
-- encontrado por más de una organización.
--
-- Lo que SÍ es local a cada organización es el ACCESO:
-- `vehicle_access_grants` decide qué organización puede leer un vehículo,
-- `vehicle_ownership_claims` es la relación cliente-local↔vehículo
-- (provisional, nunca verificada por este comando), y
-- `vehicle_odometer_events`/`vehicle_ownerships` registran quién actuó.
--
-- Protección contra enumeración a nivel Postgres: ninguna policy de
-- `vehicles`/`vehicle_identifiers` concede SELECT sin que exista una fila
-- de `vehicle_access_grants` no revocada para una organización del actor.
-- Un `select * from vehicles where id = '<uuid adivinado>'` devuelve cero
-- filas exista o no el vehículo — la misma respuesta para "no existe" y
-- "existe pero esta organización no tiene acceso" (mismo patrón que
-- `neutralResourceNotAvailable`, R0-C sección 5.2 step 3). La búsqueda
-- privada de `RegisterVehicle` (normaliza → busca → no revela
-- coincidencias) corre hoy en el motor de fixtures en memoria de
-- `packages/application` (R0-D Fase 1, sin Postgres real todavía); cuando
-- se conecte Postgres, esa búsqueda se implementará como una función
-- `security definer` invocada desde una transacción de aplicación —
-- nunca como un SELECT directo expuesto a `authenticated`.

-- ===========================================================================
-- 1. vehicles
-- ===========================================================================

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  primary_vin text,
  primary_plate text,
  make text,
  model text,
  year integer check (year is null or (year between 1900 and 2100)),
  color text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  check (primary_vin is not null or primary_plate is not null)
);

comment on table vehicles is
  'Identidad global del vehículo físico — sin organization_id a propósito (ver cabecera de esta migración). El acceso por tenant vive en vehicle_access_grants.';

-- ===========================================================================
-- 2. vehicle_identifiers
-- ===========================================================================

create table vehicle_identifiers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  identifier_type text not null check (identifier_type in ('vin', 'plate')),
  normalized_value text not null check (btrim(normalized_value) <> ''),
  raw_value text not null check (btrim(raw_value) <> ''),
  -- Solo procedencia — nunca implica que esa organización tenga acceso de
  -- lectura; el acceso se decide exclusivamente en vehicle_access_grants.
  recorded_by_organization_id uuid references organizations (id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (identifier_type, normalized_value)
);

comment on table vehicle_identifiers is
  'VIN/placa normalizados, uno o más por vehículo. La unique en (identifier_type, normalized_value) hace que un VIN repetido SIEMPRE resuelva al mismo vehicle_id — es lo que permite a RegisterVehicle enlazar en vez de duplicar.';

-- La unique de arriba cubre VIN de forma correcta (globalmente único por
-- diseño real). Para placas, donde la reasignación es un caso real, se dejó
-- la misma unique por simplicidad de R0 (evita duplicar la placa activa);
-- una placa reasignada a un vehículo distinto es un caso de Control
-- (fusión/corrección), no de R0-D Fase 1 — documentado, no resuelto aquí.
create index vehicle_identifiers_vehicle_idx on vehicle_identifiers (vehicle_id);

-- ===========================================================================
-- 3. vehicle_ownership_claims
-- ===========================================================================

create table vehicle_ownership_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  customer_id uuid not null,
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  claim_kind text not null check (claim_kind in ('self_reported', 'imported', 'transferred')),
  -- 'provisional' es el único estado que este comando produce (sección 5:
  -- "ownership claim no es ownership verificado"). 'verified' solo se
  -- alcanza por un proceso separado (fuera de R0-D Fase 1) que también
  -- escribe una fila en vehicle_ownerships.
  status text not null default 'provisional'
    check (status in ('provisional', 'verified', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (customer_id, organization_id) references customers (id, organization_id) on delete cascade
);

comment on table vehicle_ownership_claims is
  'Claim provisional local cliente<->vehículo (sección 5). Nunca implica ownership verificado ni concede acceso por sí mismo — el acceso lo otorga vehicle_access_grants.';

create index vehicle_ownership_claims_org_idx on vehicle_ownership_claims (organization_id);
create index vehicle_ownership_claims_customer_idx on vehicle_ownership_claims (customer_id);
create index vehicle_ownership_claims_vehicle_idx on vehicle_ownership_claims (vehicle_id);

-- ===========================================================================
-- 4. vehicle_ownerships
-- ===========================================================================
-- Intervalo VERIFICADO (R0-A sección 4.13: "usuario/identidad + vehículo,
-- intervalo verificado"). Ningún comando de R0-D Fase 1 escribe aquí —
-- verificar un claim es un flujo posterior, fuera de alcance — pero la
-- tabla se crea ahora para no cambiar el modelo central en una ola futura
-- (mismo principio que documents/document_versions en R0-A sección 4.12).

create table vehicle_ownerships (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  -- Identidad global (auth.users), no un customer_id local: la propiedad
  -- verificada de un vehículo es un hecho sobre la persona, no sobre su
  -- relación con un taller en particular.
  owner_user_id uuid references auth.users (id),
  source_claim_id uuid references vehicle_ownership_claims (id),
  verified_by uuid references auth.users (id),
  verified_in_organization_id uuid references organizations (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

comment on table vehicle_ownerships is
  'Propiedad verificada (no un claim). Vacía en R0-D Fase 1 — ninguna de las seis comandas de esta fase escribe aquí.';

create index vehicle_ownerships_vehicle_idx on vehicle_ownerships (vehicle_id);
create index vehicle_ownerships_owner_idx on vehicle_ownerships (owner_user_id);

-- ===========================================================================
-- 5. vehicle_access_grants
-- ===========================================================================

create table vehicle_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  granted_to_customer_id uuid,
  scope text not null check (scope in ('read_own_case', 'service_history_read', 'full_manage')),
  source text not null check (source in ('registration', 'ownership_claim', 'service_case', 'manual')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  foreign key (granted_to_customer_id, organization_id)
    references customers (id, organization_id) on delete cascade
);

comment on table vehicle_access_grants is
  'La única fuente de "esta organización puede leer este vehículo" (sección 5: "concede solo el acceso necesario"). vehicles/vehicle_identifiers nunca se leen sin pasar por aquí.';

create index vehicle_access_grants_org_idx on vehicle_access_grants (organization_id);
create index vehicle_access_grants_vehicle_idx on vehicle_access_grants (vehicle_id);
create index vehicle_access_grants_active_idx
  on vehicle_access_grants (organization_id, vehicle_id)
  where revoked_at is null;

-- ===========================================================================
-- 6. vehicle_odometer_events
-- ===========================================================================

create table vehicle_odometer_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles (id) on delete cascade,
  organization_id uuid not null references organizations (id),
  recorded_at timestamptz not null,
  value_km integer not null check (value_km >= 0),
  raw_value numeric not null check (raw_value >= 0),
  raw_unit text not null check (raw_unit in ('km', 'mi')),
  provenance text not null check (provenance in ('observed', 'measured', 'reported', 'estimated', 'derived')),
  actor_id uuid references auth.users (id),
  status text not null default 'accepted' check (status in ('accepted', 'conflict')),
  conflict_reason text check (
    conflict_reason is null
    or conflict_reason in ('regression', 'implausible_jump', 'out_of_order_reading')
  ),
  created_at timestamptz not null default now(),
  check (status = 'accepted' or conflict_reason is not null)
);

comment on table vehicle_odometer_events is
  'Append-only — sección 5: "odómetro guarda valor, unidad, procedencia, actor y fecha; valores atípicos generan conflicto, no sobrescritura". Un evento en conflicto se conserva junto al anterior, nunca lo reemplaza.';

create index vehicle_odometer_events_vehicle_idx
  on vehicle_odometer_events (vehicle_id, recorded_at desc);
create index vehicle_odometer_events_org_idx on vehicle_odometer_events (organization_id);

-- No UPDATE/DELETE grant exists anywhere below for `authenticated` — this
-- table is append-only by omission, matching R0-A sección 4.14: "hechos
-- operativos no usan borrado en cascada".

-- ===========================================================================
-- 7. RLS + grants
-- ===========================================================================

revoke all on vehicles, vehicle_identifiers, vehicle_ownership_claims, vehicle_ownerships,
  vehicle_access_grants, vehicle_odometer_events from public, anon, authenticated;

alter table vehicles enable row level security;
alter table vehicle_identifiers enable row level security;
alter table vehicle_ownership_claims enable row level security;
alter table vehicle_ownerships enable row level security;
alter table vehicle_access_grants enable row level security;
alter table vehicle_odometer_events enable row level security;

alter table vehicles force row level security;
alter table vehicle_identifiers force row level security;
alter table vehicle_ownership_claims force row level security;
alter table vehicle_ownerships force row level security;
alter table vehicle_access_grants force row level security;
alter table vehicle_odometer_events force row level security;

grant select on vehicles to authenticated;
grant select on vehicle_identifiers to authenticated;
grant select on vehicle_ownership_claims to authenticated;
grant select on vehicle_ownerships to authenticated;
grant select on vehicle_access_grants to authenticated;
grant select on vehicle_odometer_events to authenticated;

-- --- vehicles / vehicle_identifiers: solo vía grant activo -----------------
-- Verdadero si CUALQUIER organización donde el actor tiene `vehicle.read`
-- activo posee un vehicle_access_grants no revocado para este vehículo.
create policy vehicles_select_via_access_grant on vehicles
  for select to authenticated
  using (
    exists (
      select 1
      from vehicle_access_grants g
      where g.vehicle_id = vehicles.id
        and g.revoked_at is null
        and datatek_platform.has_org_permission(g.organization_id, 'vehicle.read')
    )
    or exists (
      select 1
      from vehicle_ownerships o
      where o.vehicle_id = vehicles.id and o.owner_user_id = datatek_platform.current_actor()
    )
    or (
      datatek_platform.has_active_platform_membership()
      and exists (
        select 1 from vehicle_access_grants g
        where g.vehicle_id = vehicles.id
          and g.revoked_at is null
          and datatek_platform.has_active_support_session(g.organization_id)
      )
    )
  );

create policy vehicle_identifiers_select_via_access_grant on vehicle_identifiers
  for select to authenticated
  using (
    exists (
      select 1
      from vehicle_access_grants g
      where g.vehicle_id = vehicle_identifiers.vehicle_id
        and g.revoked_at is null
        and datatek_platform.has_org_permission(g.organization_id, 'vehicle.read')
    )
    or (
      datatek_platform.has_active_platform_membership()
      and exists (
        select 1 from vehicle_access_grants g
        where g.vehicle_id = vehicle_identifiers.vehicle_id
          and g.revoked_at is null
          and datatek_platform.has_active_support_session(g.organization_id)
      )
    )
  );

-- --- vehicle_ownership_claims -----------------------------------------------
create policy vehicle_ownership_claims_select on vehicle_ownership_claims
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'vehicle.manage')
    or datatek_platform.actor_is_linked_customer(customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- --- vehicle_ownerships ------------------------------------------------------
create policy vehicle_ownerships_select on vehicle_ownerships
  for select to authenticated
  using (
    owner_user_id = datatek_platform.current_actor()
    or exists (
      select 1
      from vehicle_access_grants g
      where g.vehicle_id = vehicle_ownerships.vehicle_id
        and g.revoked_at is null
        and datatek_platform.has_org_permission(g.organization_id, 'vehicle.read')
    )
    or datatek_platform.has_active_platform_membership()
  );

-- --- vehicle_access_grants ---------------------------------------------------
create policy vehicle_access_grants_select on vehicle_access_grants
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'vehicle.read')
    or (
      granted_to_customer_id is not null
      and datatek_platform.actor_is_linked_customer(granted_to_customer_id, organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- --- vehicle_odometer_events ---------------------------------------------------
-- Cualquier organización con acceso activo al vehículo ve el historial
-- completo de odómetro (útil para cualquier taller que lo revise, por
-- ejemplo para detectar el mismo conflicto). R0-D Fase 2+ puede acotar esto
-- por `scope = 'service_history_read'` si se decide restringir más; no se
-- decide aquí para no inventar alcance fuera de sección 5.
create policy vehicle_odometer_events_select on vehicle_odometer_events
  for select to authenticated
  using (
    exists (
      select 1
      from vehicle_access_grants g
      where g.vehicle_id = vehicle_odometer_events.vehicle_id
        and g.revoked_at is null
        and datatek_platform.has_org_permission(g.organization_id, 'vehicle.read')
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(vehicle_odometer_events.organization_id)
    )
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated`/`anon` —
-- toda mutación (incluida la búsqueda privada de RegisterVehicle) pasa por
-- un comando de aplicación con Service Role, igual que 0010/0020.
