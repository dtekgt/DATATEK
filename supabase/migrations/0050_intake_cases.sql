-- Datatek — migración 0050: intake y casos (R0-D Fase 2, ola `0050`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0020/0030/0040 (ver sus cabeceras).
-- `implemented_pending_environment_evidence` hasta `pnpm db:reset && pnpm
-- test:db` con Docker disponible.
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 7
-- (Intake y caso) y DATATEK_R0_A_CONTRACT_PACK.md sección 4.6 (10 tablas),
-- sección 5.1 (estados y transiciones del caso, tabla literal).
--
-- Diseño: `cases` es local a la organización (mismo patrón que `customers`
-- en 0020). El folio es secuencial POR ORGANIZACIÓN vía
-- `organization_counters` (0010) — nunca global — mediante el helper
-- `datatek_platform.next_organization_counter` definido aquí porque esta es
-- la primera ola que necesita consumir un folio.
--
-- Las 15 claves de `case_statuses` (packages/domain/generated/spec.constants.ts,
-- generado de R0-A sección 13) se listan completas en el CHECK aunque R0
-- solo alcance el subconjunto de la tabla de transiciones de sección 5.1 —
-- mismo principio que `quote_version_statuses`/`case_statuses` en R0-A: el
-- enum físico no cambia cuando R1 active `in_progress`/`blocked`/etc.

-- ===========================================================================
-- 0. Helper: folio secuencial por organización
-- ===========================================================================

create function datatek_platform.next_organization_counter(p_organization_id uuid, p_counter_key text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current bigint;
begin
  insert into organization_counters (organization_id, counter_key, next_value)
  values (p_organization_id, p_counter_key, 2)
  on conflict (organization_id, counter_key)
  do update set next_value = organization_counters.next_value + 1
  returning next_value - 1 into v_current;
  return v_current;
end;
$$;

comment on function datatek_platform.next_organization_counter(uuid, text) is
  'Folio atómico por (organization_id, counter_key) — sección 7: "folio secuencial por organización". No se otorga a `authenticated`: solo lo invoca un comando de aplicación con Service Role (o una función RPC de ola futura), nunca directamente desde el navegador.';

revoke all on function datatek_platform.next_organization_counter(uuid, text) from public, anon, authenticated;

-- ===========================================================================
-- 1. intake_threads
-- ===========================================================================

create table intake_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  -- Nullable: un thread puede empezar antes de que el cliente esté
  -- resuelto (sección 7: "cliente/contacto cuando se conoce").
  customer_id uuid,
  channel text not null default 'whatsapp_manual'
    check (channel in ('whatsapp_manual', 'phone_manual', 'walk_in', 'email_manual')),
  status text not null default 'open' check (status in ('open', 'converted', 'closed')),
  correlation_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (customer_id, organization_id) references customers (id, organization_id) on delete set null,
  unique (id, organization_id)
);

comment on table intake_threads is
  'Hilo de intake manual (sección 7: "R0 no se conecta a WhatsApp API"). status=converted cuando CreateCaseFromIntake ya generó un caso desde este thread.';

create index intake_threads_org_idx on intake_threads (organization_id);
create index intake_threads_customer_idx on intake_threads (customer_id);

-- ===========================================================================
-- 2. intake_entries
-- ===========================================================================
-- Append-only — el texto original nunca se edita ni se borra (sección 7:
-- "conservar texto original"). La interpretación estructurada vive en
-- `reported_symptoms`, en una fila separada que referencia esta.

create table intake_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id uuid not null,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  original_text text not null check (btrim(original_text) <> ''),
  -- Archivos mencionados en el mensaje, sin modelarlos aún como
  -- evidence_assets (ola 0070) — solo una referencia informal de intake.
  referenced_files jsonb not null default '[]'::jsonb,
  reported_at timestamptz not null,
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (thread_id, organization_id) references intake_threads (id, organization_id) on delete cascade,
  unique (id, organization_id)
);

comment on table intake_entries is
  'Un mensaje/entrada de un intake_thread. Append-only: nunca se actualiza ni se borra (sección 7).';

create index intake_entries_thread_idx on intake_entries (thread_id, reported_at);
create index intake_entries_org_idx on intake_entries (organization_id);

-- ===========================================================================
-- 3. cases
-- ===========================================================================

create table cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid references organization_branches (id),
  folio_number bigint not null check (folio_number > 0),
  -- Formato de presentación fijado en el momento de creación (p.ej.
  -- "2026-00001") — nunca depende de organization_slug_history, que sí
  -- puede cambiar (sección 4.14: "organization_slug_history conserva
  -- redirecciones"), así que el folio no incrusta el slug.
  folio_code text not null check (btrim(folio_code) <> ''),
  customer_id uuid not null,
  vehicle_id uuid not null references vehicles (id),
  status text not null default 'new' check (
    status in (
      'new', 'triage', 'waiting_customer', 'scheduled', 'received',
      'inspection', 'waiting_authorization', 'ready', 'in_progress',
      'blocked', 'quality', 'ready_for_delivery', 'delivered', 'closed', 'cancelled'
    )
  ),
  source_intake_thread_id uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (customer_id, organization_id) references customers (id, organization_id),
  foreign key (source_intake_thread_id, organization_id)
    references intake_threads (id, organization_id) on delete set null,
  unique (organization_id, folio_number),
  unique (id, organization_id),
  check (closed_at is null or closed_at >= opened_at)
);

comment on table cases is
  'Expediente operativo central (sección 7). folio_number es secuencial POR ORGANIZACIÓN vía organization_counters — nunca global.';

create trigger cases_set_updated_at
  before update on cases
  for each row execute function datatek_platform.set_updated_at();

create index cases_org_idx on cases (organization_id);
create index cases_org_status_idx on cases (organization_id, status);
create index cases_customer_idx on cases (customer_id);
create index cases_vehicle_idx on cases (vehicle_id);

-- ===========================================================================
-- 4. case_participants
-- ===========================================================================
-- Personas del lado cliente conectadas al caso (el cliente principal,
-- conductores adicionales, garante). Distinta de `case_assignments`
-- (staff). CreateCaseFromIntake escribe automáticamente la fila del
-- cliente principal; ningún comando de esta fase escribe 'other_driver'/
-- 'guarantor' todavía — igual que `vehicle_ownerships` quedó lista pero
-- vacía en 0030 Fase 1.

create table case_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  customer_id uuid,
  participant_kind text not null check (participant_kind in ('customer', 'other_driver', 'guarantor')),
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (customer_id, organization_id) references customers (id, organization_id)
);

comment on table case_participants is
  'Personas del lado cliente conectadas al caso. CreateCaseFromIntake agrega automáticamente al cliente principal como participant_kind=customer.';

create index case_participants_case_idx on case_participants (case_id);
create index case_participants_org_idx on case_participants (organization_id);

-- ===========================================================================
-- 5. case_assignments
-- ===========================================================================
-- Responsables de staff (sección 15 Pro: "siempre incluye responsable...").
-- Escrita por AssignCaseParticipant.

create table case_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  role text not null check (role in ('advisor', 'inspector', 'mechanic', 'other')),
  user_id uuid not null references auth.users (id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users (id),
  unassigned_at timestamptz,
  unassigned_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  check (unassigned_at is null or unassigned_at >= assigned_at)
);

comment on table case_assignments is
  'Asignación de staff responsable por rol (sección 15: "Pro muestra siguiente acción con... responsable"). Append-friendly: reasignar crea una fila nueva y cierra la anterior con unassigned_at, nunca la sobrescribe.';

create index case_assignments_case_idx on case_assignments (case_id);
create index case_assignments_active_idx
  on case_assignments (case_id, role)
  where unassigned_at is null;

-- ===========================================================================
-- 6. service_requests
-- ===========================================================================
-- La solicitud original estructurada (una por caso, creada junto con el
-- caso en CreateCaseFromIntake) — sección 7: "solicitud original".

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  source_intake_entry_id uuid,
  summary text not null check (btrim(summary) <> ''),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (source_intake_entry_id, organization_id)
    references intake_entries (id, organization_id) on delete set null,
  unique (id, organization_id)
);

comment on table service_requests is
  'La solicitud original del cliente, en lenguaje llano, estructurada desde el intake (sección 7).';

create index service_requests_case_idx on service_requests (case_id);

-- ===========================================================================
-- 7. reported_symptoms
-- ===========================================================================
-- Uno o más por caso — InterpretReportedSymptom.

create table reported_symptoms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  service_request_id uuid,
  source_intake_entry_id uuid,
  symptom_code text not null check (btrim(symptom_code) <> ''),
  description text not null check (btrim(description) <> ''),
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (service_request_id, organization_id)
    references service_requests (id, organization_id) on delete set null,
  foreign key (source_intake_entry_id, organization_id)
    references intake_entries (id, organization_id) on delete set null
);

comment on table reported_symptoms is
  'Síntoma/solicitud estructurado sin borrar el original (sección 7). symptom_code es texto libre por diseño — no hay un catálogo cerrado de síntomas en R0.';

create index reported_symptoms_case_idx on reported_symptoms (case_id);

-- ===========================================================================
-- 8. case_notes
-- ===========================================================================
-- visibility reusa el enum Visibility (internal/customer/shared_case) de
-- packages/domain/generated/spec.constants.ts. Ley crítica: "una nota
-- internal nunca se proyecta a Pass" (sección 7) — se modela ahora aunque
-- la proyección a Pass sea de una fase posterior.

create table case_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  visibility text not null check (visibility in ('internal', 'customer', 'shared_case')),
  body text not null check (btrim(body) <> ''),
  author_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade
);

comment on table case_notes is
  'Notas con visibilidad. visibility=internal NUNCA se proyecta a Pass — invariante que cualquier query de cliente (fase posterior) debe respetar, y que las pruebas de esta fase verifican al nivel del motor de comandos.';

create index case_notes_case_idx on case_notes (case_id, created_at);

-- ===========================================================================
-- 9. case_status_events
-- ===========================================================================
-- Historial append-only de transición (sección 5.7: "case_status_events:
-- historial especializado de transición del caso"). Escrito por
-- CreateCaseFromIntake (evento inicial, from_status null) y por cada
-- comando que mueve el estado (TransitionCase, ReceiveVehicle,
-- StartInspection, CompleteInspection, RecordAuthorizationDecision en fase
-- futura).

create table case_status_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  from_status text check (
    from_status is null or from_status in (
      'new', 'triage', 'waiting_customer', 'scheduled', 'received',
      'inspection', 'waiting_authorization', 'ready', 'in_progress',
      'blocked', 'quality', 'ready_for_delivery', 'delivered', 'closed', 'cancelled'
    )
  ),
  to_status text not null check (
    to_status in (
      'new', 'triage', 'waiting_customer', 'scheduled', 'received',
      'inspection', 'waiting_authorization', 'ready', 'in_progress',
      'blocked', 'quality', 'ready_for_delivery', 'delivered', 'closed', 'cancelled'
    )
  ),
  reason text,
  actor_id uuid references auth.users (id),
  correlation_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade
);

comment on table case_status_events is
  'Append-only. Nunca se actualiza ni se borra una fila — una corrección posterior es un evento nuevo (ley 2 R0-A: "el pasado se corrige mediante nueva versión o evento compensatorio; no se borra").';

create index case_status_events_case_idx on case_status_events (case_id, occurred_at);

-- ===========================================================================
-- 10. case_blockers
-- ===========================================================================
-- Tabla completa con RLS desde ya (ley 27), sin comando que escriba en
-- ella todavía en R0-D Fase 2 — ningún comando de la sección 3 de esta fase
-- se llama "RaiseCaseBlocker"/similar. Mismo patrón que
-- `vehicle_ownerships` en 0030 Fase 1: lista para una fase futura, vacía
-- hoy, documentado aquí en vez de omitida silenciosamente.

create table case_blockers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  description text not null check (btrim(description) <> ''),
  resolvable_by text,
  raised_at timestamptz not null default now(),
  raised_by uuid references auth.users (id),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  resolution_note text,
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  check (resolved_at is null or resolved_at >= raised_at)
);

comment on table case_blockers is
  'Bloqueo operativo del caso (sección 15: "bloqueo opcional"). Sin comando de aplicación en R0-D Fase 2 — tabla lista, RLS completa, sin escritor todavía (igual que vehicle_ownerships en 0030 Fase 1).';

create index case_blockers_case_idx on case_blockers (case_id);
create index case_blockers_open_idx on case_blockers (case_id) where resolved_at is null;

-- ===========================================================================
-- 11. RLS + grants
-- ===========================================================================
-- Mismo principio que 0020/0030/0040: RLS en cada tabla; ninguna policy de
-- insert/update/delete para `authenticated` — toda escritura pasa por un
-- comando de aplicación con Service Role. Lectura: staff con
-- intake.manage/case-adjacent ve todo el expediente de su organización; un
-- cliente vinculado ve solo lo que cuelga de su propio caso; soporte
-- elevado ve dentro de su sesión activa.
--
-- case_notes es la única excepción de lectura: un cliente vinculado NUNCA
-- lee case_notes directamente vía esta policy sin importar su visibility —
-- esa proyección filtrada es responsabilidad de un query contract de fase
-- futura (sección 3.1), no de RLS de base. RLS aquí solo protege
-- aislamiento de tenant; ocultar `internal` de un cliente vinculado
-- pertenece a la capa de aplicación para poder, en el futuro, exponer
-- notas `customer`/`shared_case` sin reescribir RLS. Documentado en vez de
-- resuelto en silencio.

revoke all on intake_threads, intake_entries, cases, case_participants, case_assignments,
  service_requests, reported_symptoms, case_notes, case_status_events, case_blockers
  from public, anon, authenticated;

alter table intake_threads enable row level security;
alter table intake_entries enable row level security;
alter table cases enable row level security;
alter table case_participants enable row level security;
alter table case_assignments enable row level security;
alter table service_requests enable row level security;
alter table reported_symptoms enable row level security;
alter table case_notes enable row level security;
alter table case_status_events enable row level security;
alter table case_blockers enable row level security;

alter table intake_threads force row level security;
alter table intake_entries force row level security;
alter table cases force row level security;
alter table case_participants force row level security;
alter table case_assignments force row level security;
alter table service_requests force row level security;
alter table reported_symptoms force row level security;
alter table case_notes force row level security;
alter table case_status_events force row level security;
alter table case_blockers force row level security;

grant select on intake_threads to authenticated;
grant select on intake_entries to authenticated;
grant select on cases to authenticated;
grant select on case_participants to authenticated;
grant select on case_assignments to authenticated;
grant select on service_requests to authenticated;
grant select on reported_symptoms to authenticated;
grant select on case_notes to authenticated;
grant select on case_status_events to authenticated;
grant select on case_blockers to authenticated;

create policy intake_threads_select on intake_threads
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.manage')
    or (customer_id is not null and datatek_platform.actor_is_linked_customer(customer_id, organization_id))
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy intake_entries_select on intake_entries
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.manage')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy cases_select on cases
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or datatek_platform.actor_is_linked_customer(customer_id, organization_id)
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy case_participants_select on case_participants
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy case_assignments_select on case_assignments
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy service_requests_select on service_requests
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or exists (
      select 1 from cases c
      where c.id = service_requests.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy reported_symptoms_select on reported_symptoms
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or exists (
      select 1 from cases c
      where c.id = reported_symptoms.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- case_notes: solo staff (intake.manage) y soporte elevado. Ningún cliente
-- vinculado lee esta tabla directamente vía RLS — ver nota de diseño arriba.
create policy case_notes_select on case_notes
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.manage')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy case_status_events_select on case_status_events
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or exists (
      select 1 from cases c
      where c.id = case_status_events.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy case_blockers_select on case_blockers
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'intake.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );
