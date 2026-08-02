-- Datatek — migración 0060: agenda y reservas (R0-D Fase 2, ola `0060`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0020/0030/0040/0050 (ver sus cabeceras).
-- `implemented_pending_environment_evidence` hasta `pnpm db:reset && pnpm
-- test:db` con Docker disponible.
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 8
-- (Agenda) y DATATEK_R0_A_CONTRACT_PACK.md sección 4.7 (8 tablas), sección
-- 5.2 (estados de cita).
--
-- Pieza crítica de esta ola: `resource_reservations` usa
-- `EXCLUDE USING gist` con `btree_gist` (habilitado desde 0000) sobre
-- `[starts_at, ends_at)` por recurso — dos transacciones concurrentes NO
-- pueden reservar el mismo espacio. Esta es la única garantía real de "no
-- doble reserva"; el motor de fixtures en memoria (sin Postgres alcanzable
-- todavía) replica la MISMA regla de negocio en TypeScript
-- (packages/application/src/commands/agenda-commands.ts) para poder
-- demostrarla end-to-end sin Postgres, pero el constraint de abajo es la
-- fuente de verdad una vez Postgres esté disponible.

-- ===========================================================================
-- 1. resources
-- ===========================================================================

create table resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references organization_branches (id),
  resource_type text not null check (resource_type in ('bay', 'technician', 'equipment', 'mobile_unit')),
  label text not null check (btrim(label) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

comment on table resources is
  'Recurso reservable (bahía, técnico, equipo, unidad móvil) — sección 8.';

create trigger resources_set_updated_at
  before update on resources
  for each row execute function datatek_platform.set_updated_at();

create index resources_org_idx on resources (organization_id);
create index resources_org_active_idx on resources (organization_id) where is_active;

-- ===========================================================================
-- 2. resource_capabilities
-- ===========================================================================

create table resource_capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  resource_id uuid not null,
  capability_key text not null check (btrim(capability_key) <> ''),
  created_at timestamptz not null default now(),
  foreign key (resource_id, organization_id) references resources (id, organization_id) on delete cascade,
  unique (resource_id, capability_key)
);

comment on table resource_capabilities is
  'Etiquetas de lo que un recurso puede hacer (p.ej. brake_service) — usado para filtrar disponibilidad, no aplicado como constraint duro en R0.';

create index resource_capabilities_resource_idx on resource_capabilities (resource_id);

-- ===========================================================================
-- 3. resource_schedules
-- ===========================================================================

create table resource_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  resource_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_time time not null,
  ends_time time not null,
  -- IANA por organización/sucursal (sección 4.14). 'America/Guatemala' es
  -- seed, no hardcode universal.
  timezone text not null default 'America/Guatemala',
  created_at timestamptz not null default now(),
  foreign key (resource_id, organization_id) references resources (id, organization_id) on delete cascade,
  check (ends_time > starts_time)
);

comment on table resource_schedules is
  'Horario recurrente semanal de un recurso. No enforced como constraint duro sobre resource_reservations en R0 (validación de disponibilidad es responsabilidad de la capa de aplicación, no de RLS/constraint).';

create index resource_schedules_resource_idx on resource_schedules (resource_id, weekday);

-- ===========================================================================
-- 4. capacity_blocks
-- ===========================================================================

create table capacity_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_kind text not null check (block_kind in ('unavailable', 'extra_capacity')),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (resource_id, organization_id) references resources (id, organization_id) on delete cascade,
  check (ends_at > starts_at)
);

comment on table capacity_blocks is
  'Excepción de capacidad (cierre, mantenimiento, capacidad extra) sobre un recurso, fuera del horario recurrente.';

create index capacity_blocks_resource_idx on capacity_blocks (resource_id, starts_at);

-- ===========================================================================
-- 5. appointments
-- ===========================================================================

create table appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references organization_branches (id),
  case_id uuid not null,
  status text not null default 'tentative'
    check (status in ('tentative', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_reason text,
  arrived_at timestamptz,
  completed_at timestamptz,
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  unique (id, organization_id),
  check (ends_at > starts_at),
  check (status <> 'cancelled' or cancelled_at is not null),
  check (status <> 'arrived' or arrived_at is not null)
);

comment on table appointments is
  'Reserva de tiempo ligada a un caso — ley 3: "la cita administra tiempo; el caso administra la verdad operativa". No sustituye al caso.';

create trigger appointments_set_updated_at
  before update on appointments
  for each row execute function datatek_platform.set_updated_at();

create index appointments_org_idx on appointments (organization_id);
create index appointments_case_idx on appointments (case_id);
create index appointments_org_status_idx on appointments (organization_id, status);

-- ===========================================================================
-- 6. appointment_resources
-- ===========================================================================

create table appointment_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  appointment_id uuid not null,
  resource_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (appointment_id, organization_id) references appointments (id, organization_id) on delete cascade,
  foreign key (resource_id, organization_id) references resources (id, organization_id) on delete cascade,
  unique (appointment_id, resource_id)
);

comment on table appointment_resources is
  'Recursos reservados para una cita (many-to-many).';

create index appointment_resources_appointment_idx on appointment_resources (appointment_id);
create index appointment_resources_resource_idx on appointment_resources (resource_id);

-- ===========================================================================
-- 7. assignment_events
-- ===========================================================================

create table assignment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  appointment_id uuid not null,
  resource_id uuid,
  event_type text not null check (
    event_type in ('resource_added', 'resource_removed', 'rescheduled', 'status_changed')
  ),
  details jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users (id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (appointment_id, organization_id) references appointments (id, organization_id) on delete cascade
);

comment on table assignment_events is
  'Historial append-only de cambios de asignación/estado de una cita.';

create index assignment_events_appointment_idx on assignment_events (appointment_id, occurred_at);

-- ===========================================================================
-- 8. resource_reservations
-- ===========================================================================
-- Pieza crítica de la ola — ver cabecera del archivo.

create table resource_reservations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  resource_id uuid not null,
  appointment_id uuid not null,
  status text not null default 'hold' check (status in ('hold', 'active', 'released')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Solo los holds expiran; una reserva 'active' no tiene vencimiento
  -- implícito (se libera explícitamente al cancelar/completar la cita).
  expires_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  released_at timestamptz,
  released_reason text,
  foreign key (resource_id, organization_id) references resources (id, organization_id) on delete cascade,
  foreign key (appointment_id, organization_id) references appointments (id, organization_id) on delete cascade,
  check (ends_at > starts_at),
  check (status <> 'hold' or expires_at is not null),
  check (status <> 'released' or released_at is not null)
);

comment on table resource_reservations is
  'Rango [starts_at, ends_at) reservado para un recurso. El EXCLUDE de abajo es la garantía real de "no doble reserva" (sección 8): dos transacciones concurrentes no pueden reservar el mismo espacio.';

-- EXCLUDE USING gist con btree_gist (0000) sobre [starts_at, ends_at) por
-- recurso. Partial: una reserva 'released' no bloquea nada — cancelar
-- libera el espacio para otra cita (sección 8.2 R0-A: "cancelar libera la
-- reserva mediante transición").
alter table resource_reservations
  add constraint resource_reservations_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status <> 'released');

create index resource_reservations_resource_idx on resource_reservations (resource_id, starts_at);
create index resource_reservations_appointment_idx on resource_reservations (appointment_id);
create index resource_reservations_org_idx on resource_reservations (organization_id);
-- Soporta expirar holds vencidos en lote (worker de una ola futura).
create index resource_reservations_hold_expiry_idx
  on resource_reservations (expires_at)
  where status = 'hold';

-- ===========================================================================
-- 9. RLS + grants
-- ===========================================================================
-- Mismo principio que olas previas: RLS en cada tabla, sin
-- insert/update/delete para `authenticated` — toda escritura pasa por un
-- comando de aplicación con Service Role. `agenda.read`/`agenda.manage`
-- gobiernan lectura de staff; un cliente vinculado ve las citas de sus
-- propios casos (vía `cases.customer_id`), nunca la agenda completa del
-- taller.

revoke all on resources, resource_capabilities, resource_schedules, capacity_blocks,
  appointments, appointment_resources, assignment_events, resource_reservations
  from public, anon, authenticated;

alter table resources enable row level security;
alter table resource_capabilities enable row level security;
alter table resource_schedules enable row level security;
alter table capacity_blocks enable row level security;
alter table appointments enable row level security;
alter table appointment_resources enable row level security;
alter table assignment_events enable row level security;
alter table resource_reservations enable row level security;

alter table resources force row level security;
alter table resource_capabilities force row level security;
alter table resource_schedules force row level security;
alter table capacity_blocks force row level security;
alter table appointments force row level security;
alter table appointment_resources force row level security;
alter table assignment_events force row level security;
alter table resource_reservations force row level security;

grant select on resources to authenticated;
grant select on resource_capabilities to authenticated;
grant select on resource_schedules to authenticated;
grant select on capacity_blocks to authenticated;
grant select on appointments to authenticated;
grant select on appointment_resources to authenticated;
grant select on assignment_events to authenticated;
grant select on resource_reservations to authenticated;

create policy resources_select on resources
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy resource_capabilities_select on resource_capabilities
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy resource_schedules_select on resource_schedules
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy capacity_blocks_select on capacity_blocks
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy appointments_select on appointments
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or exists (
      select 1 from cases c
      where c.id = appointments.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy appointment_resources_select on appointment_resources
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy assignment_events_select on assignment_events
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy resource_reservations_select on resource_reservations
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'agenda.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );
