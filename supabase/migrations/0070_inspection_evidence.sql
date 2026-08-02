-- Datatek — migración 0070: inspección y evidencia (R0-D Fase 2, ola `0070`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0020/0030/0040/0050/0060 (ver sus cabeceras).
-- `implemented_pending_environment_evidence` hasta `pnpm db:reset && pnpm
-- test:db` con Docker disponible.
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md secciones
-- 9 (Inspección de frenos) y 10 (Evidencia); DATATEK_R0_A_CONTRACT_PACK.md
-- sección 4.8 (12 tablas), sección 5.3 (estados de inspección), sección 7
-- completa (contrato de la vertical de frenos), sección 8 completa
-- (contrato de evidencia).
--
-- Diseño: el template es versionado e inmutable una vez usado — una
-- inspección fija `template_version_id` al iniciar (sección 9:
-- "template version fijado al iniciar") y esa referencia nunca cambia. La
-- distinción `inspection_results` (condición, sección 7.2 "condición
-- canónica R0") vs `measurements` (valor+unidad, sección 7.2 "una medida
-- guarda unidad explícita") es intencional: `RecordInspectionResult`
-- clasifica CUALQUIER item del template; `RecordMeasurement` adjunta el
-- valor numérico exacto SOLO para los items que lo requieren
-- (packages/domain/src/inspection/brakes-template.ts,
-- `requiresMeasurement`) — "una condición no reemplaza la medición cuando
-- esta es requerida" (sección 7.2).
--
-- Coherencia eje/lado (sección 7.4: "eje/lado incoherente") se valida en
-- packages/domain/src/inspection/completion-gate.ts, no aquí — un CHECK
-- constraint no puede consultar `inspection_template_items.scope` sin un
-- trigger, y R0-D Fase 2 deja ese endurecimiento documentado para R0-E
-- (hardening). El CHECK de abajo sí impone la regla más simple y segura:
-- axle y side se registran juntos o ninguno, nunca uno sin el otro.

-- ===========================================================================
-- 1. inspection_templates
-- ===========================================================================

create table inspection_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (btrim(name) <> ''),
  description text,
  created_at timestamptz not null default now()
);

comment on table inspection_templates is
  'Familia de template (p.ej. "brakes"). Neutral, sin organization_id — igual que service_catalog_items en 0040.';

-- ===========================================================================
-- 2. inspection_template_versions
-- ===========================================================================

create table inspection_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references inspection_templates (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (template_id, version_number),
  check (effective_until is null or effective_until > effective_from)
);

comment on table inspection_template_versions is
  'Versión inmutable de un template. Una inspección fija esta referencia al iniciar (sección 9) — status pasando a retired NUNCA reescribe una inspección ya iniciada; solo hace que CompleteInspection detecte "template no vigente" si aplica (sección 7.4).';

create index inspection_template_versions_template_idx on inspection_template_versions (template_id);
create index inspection_template_versions_active_idx
  on inspection_template_versions (template_id)
  where status = 'active';

-- ===========================================================================
-- 3. inspection_template_sections
-- ===========================================================================

create table inspection_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references inspection_template_versions (id) on delete cascade,
  key text not null check (btrim(key) <> ''),
  label text not null check (btrim(label) <> ''),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_version_id, key)
);

comment on table inspection_template_sections is
  'Sección del template (p.ej. "Pastillas", "Disco") — sección 7.2.';

create index inspection_template_sections_version_idx on inspection_template_sections (template_version_id);

-- ===========================================================================
-- 4. inspection_template_items
-- ===========================================================================

create table inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references inspection_template_versions (id) on delete cascade,
  section_id uuid not null references inspection_template_sections (id) on delete cascade,
  item_key text not null check (btrim(item_key) <> ''),
  label text not null check (btrim(label) <> ''),
  scope text not null check (scope in ('axle_side', 'vehicle')),
  requires_measurement boolean not null default false,
  measurement_unit text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_version_id, item_key),
  check (not requires_measurement or measurement_unit is not null)
);

comment on table inspection_template_items is
  'Item del template — fila 1:1 con la tabla literal de R0-A sección 7.2. scope=axle_side requiere eje+lado en cada resultado; scope=vehicle no lleva ninguno.';

create index inspection_template_items_version_idx on inspection_template_items (template_version_id);
create index inspection_template_items_section_idx on inspection_template_items (section_id);

-- ===========================================================================
-- 5. inspections
-- ===========================================================================

create table inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null,
  vehicle_id uuid not null references vehicles (id),
  template_version_id uuid not null references inspection_template_versions (id),
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'completed', 'corrected', 'invalidated')),
  started_at timestamptz not null default now(),
  started_by uuid references auth.users (id),
  completed_at timestamptz,
  completed_by uuid references auth.users (id),
  invalidated_at timestamptz,
  invalidated_reason text,
  previous_inspection_id uuid references inspections (id),
  odometer_km_at_inspection integer check (odometer_km_at_inspection is null or odometer_km_at_inspection >= 0),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  unique (id, organization_id),
  check (status <> 'completed' or (completed_at is not null and completed_by is not null)),
  check (status <> 'invalidated' or invalidated_reason is not null),
  check (previous_inspection_id is null or previous_inspection_id <> id)
);

comment on table inspections is
  'Corregir crea una NUEVA revisión que referencia la anterior vía previous_inspection_id (sección 5.3 R0-A: "corregir crea una nueva revisión y referencia la anterior") — nunca se reescribe una inspección completada.';

create index inspections_org_idx on inspections (organization_id);
create index inspections_case_idx on inspections (case_id);
create index inspections_vehicle_idx on inspections (vehicle_id);

-- ===========================================================================
-- 6. inspection_results
-- ===========================================================================

create table inspection_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inspection_id uuid not null,
  template_item_id uuid not null references inspection_template_items (id),
  axle text check (axle is null or axle in ('front', 'rear')),
  side text check (side is null or side in ('left', 'right', 'center')),
  condition text not null check (condition in ('pass', 'attention', 'fail', 'not_inspected', 'not_applicable')),
  provenance text not null check (provenance in ('observed', 'measured', 'reported', 'estimated', 'derived')),
  notes text,
  actor_id uuid references auth.users (id),
  measured_at timestamptz,
  revision_number integer not null default 1 check (revision_number > 0),
  created_at timestamptz not null default now(),
  foreign key (inspection_id, organization_id) references inspections (id, organization_id) on delete cascade,
  unique (id, organization_id),
  -- axle/side coherencia mínima a nivel DB — ver nota de cabecera.
  check ((axle is null) = (side is null)),
  -- not_inspected/not_applicable exigen motivo/contexto (sección 7.2).
  check (condition not in ('not_inspected', 'not_applicable') or (notes is not null and btrim(notes) <> ''))
);

comment on table inspection_results is
  'Un resultado por (inspection, item, eje, lado). revision_number soporta corrección append-only dentro de la MISMA inspección sin sobrescribir la fila previa (sección 7.2: "resultados corregidos mediante nueva revisión") — el comando siempre inserta, nunca hace UPDATE.';

create index inspection_results_inspection_idx on inspection_results (inspection_id);
create index inspection_results_org_idx on inspection_results (organization_id);
create index inspection_results_latest_idx
  on inspection_results (inspection_id, template_item_id, axle, side, revision_number desc);

-- ===========================================================================
-- 7. measurements
-- ===========================================================================

create table measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  inspection_result_id uuid not null,
  value numeric not null check (value >= 0),
  unit text not null check (btrim(unit) <> ''),
  provenance text not null check (provenance in ('observed', 'measured', 'reported', 'estimated', 'derived')),
  actor_id uuid references auth.users (id),
  measured_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (inspection_result_id, organization_id)
    references inspection_results (id, organization_id) on delete cascade,
  unique (inspection_result_id)
);

comment on table measurements is
  'Valor numérico + unidad explícita para un inspection_result que lo requiere (sección 7.2). unique(inspection_result_id): una corrección crea una nueva fila de inspection_results (nueva revision_number) y por lo tanto una nueva medición — nunca se actualiza esta fila in place.';

create index measurements_result_idx on measurements (inspection_result_id);

-- ===========================================================================
-- 8. findings
-- ===========================================================================

create table findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  inspection_id uuid,
  inspection_result_id uuid,
  description text not null check (btrim(description) <> ''),
  urgency text not null default 'info' check (urgency in ('info', 'attention', 'urgent', 'safety_critical')),
  visibility text not null check (visibility in ('internal', 'customer', 'shared_case')),
  actor_id uuid references auth.users (id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (inspection_id, organization_id) references inspections (id, organization_id) on delete set null,
  foreign key (inspection_result_id, organization_id)
    references inspection_results (id, organization_id) on delete set null
);

comment on table findings is
  'Separa observación de recomendación (sección 9: "separar: observación; medición; interpretación; recomendación; urgencia; evidencia; visibilidad"). Una recomendación (maintenance_recommendations) puede referenciar un finding, pero un finding visible NO obliga a comprar.';

-- Necesaria ANTES de maintenance_recommendations (sección 9), que
-- compound-FK-a esta tabla.
alter table findings add constraint findings_id_org_unique unique (id, organization_id);

create index findings_case_idx on findings (case_id);
create index findings_inspection_idx on findings (inspection_id);

-- ===========================================================================
-- 9. maintenance_recommendations
-- ===========================================================================
-- Contrato EXACTO de R0-A sección 4.15, citado literalmente en los CHECK.

create table maintenance_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  case_id uuid not null,
  vehicle_id uuid not null references vehicles (id),
  finding_id uuid,
  trigger_kind text not null check (trigger_kind in ('date', 'odometer', 'whichever_first', 'condition')),
  due_at timestamptz,
  due_odometer_km integer check (due_odometer_km is null or due_odometer_km >= 0),
  basis_kind text not null check (basis_kind in ('manufacturer', 'inspection', 'service_history', 'technician')),
  basis_reference jsonb not null default '{}'::jsonb,
  status text not null default 'unknown'
    check (status in ('upcoming', 'due_soon', 'due', 'overdue', 'unknown')),
  customer_explanation text,
  actor_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  foreign key (finding_id, organization_id) references findings (id, organization_id) on delete set null,
  -- "date requiere due_at; odometer requiere due_odometer_km; whichever_first
  -- requiere ambos; condition requiere explicación" (sección 4.15, literal).
  check (
    (trigger_kind = 'date' and due_at is not null and due_odometer_km is null)
    or (trigger_kind = 'odometer' and due_odometer_km is not null and due_at is null)
    or (trigger_kind = 'whichever_first' and due_at is not null and due_odometer_km is not null)
    or (trigger_kind = 'condition' and customer_explanation is not null and btrim(customer_explanation) <> '')
  )
);

comment on table maintenance_recommendations is
  'R0-A sección 4.15, contrato exacto. status=unknown "no inventa vencimiento" — la recomendación por falta de lectura usa trigger_kind=condition con customer_explanation, nunca un due_at/due_odometer_km inventado.';

create index maintenance_recommendations_case_idx on maintenance_recommendations (case_id);
create index maintenance_recommendations_vehicle_idx on maintenance_recommendations (vehicle_id);

-- ===========================================================================
-- 10. upload_intents
-- ===========================================================================

create table upload_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null,
  actor_id uuid references auth.users (id),
  purpose text not null check (btrim(purpose) <> ''),
  declared_mime text not null check (btrim(declared_mime) <> ''),
  declared_size_bytes bigint check (declared_size_bytes is null or declared_size_bytes >= 0),
  visibility_requested text not null check (visibility_requested in ('internal', 'customer', 'shared_case')),
  bucket text not null check (btrim(bucket) <> ''),
  -- No adivinable — generado por el servidor, nunca derivado de un nombre
  -- de archivo o ID secuencial (sección 10: "paths no adivinables").
  object_path text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  unique (id, organization_id),
  unique (bucket, object_path),
  check (expires_at > created_at)
);

comment on table upload_intents is
  'Paso 1 del ciclo de evidencia (sección 8.1 R0-A): CreateUploadIntent valida actor/tenant/caso/propósito/visibilidad y asigna bucket+path antes de que exista ningún archivo.';

create index upload_intents_case_idx on upload_intents (case_id);
create index upload_intents_org_idx on upload_intents (organization_id);
-- Soporta el job de limpieza de huérfanos vencidos (sección 8.1, paso 7).
create index upload_intents_pending_expiry_idx
  on upload_intents (expires_at)
  where status = 'pending';

-- ===========================================================================
-- 11. evidence_assets
-- ===========================================================================

create table evidence_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  upload_intent_id uuid not null,
  uploader_id uuid references auth.users (id),
  bucket text not null,
  path text not null,
  mime_declared text not null,
  mime_detected text,
  bytes bigint check (bytes is null or bytes >= 0),
  hash text,
  captured_at timestamptz,
  uploaded_at timestamptz,
  provenance text not null default 'observed'
    check (provenance in ('observed', 'measured', 'reported', 'estimated', 'derived')),
  -- Techo de visibilidad de este asset — nunca se amplía por un link
  -- (sección 8.3: "un link incorrecto no puede volver pública una
  -- evidencia interna"). La visibilidad EFECTIVA de un link es
  -- min(visibility_max, evidence_links.visibility) —
  -- packages/domain/src/evidence/visibility.ts.
  visibility_max text not null check (visibility_max in ('internal', 'customer', 'shared_case')),
  status text not null default 'pending_upload'
    check (status in ('pending_upload', 'uploaded', 'verified', 'rejected', 'invalidated')),
  invalidated_at timestamptz,
  invalidated_reason text,
  replaces_asset_id uuid references evidence_assets (id),
  created_at timestamptz not null default now(),
  foreign key (upload_intent_id, organization_id) references upload_intents (id, organization_id),
  unique (id, organization_id),
  unique (upload_intent_id),
  check (status <> 'invalidated' or invalidated_reason is not null),
  check (status = 'pending_upload' or (mime_detected is not null and bytes is not null and hash is not null))
);

comment on table evidence_assets is
  'ConfirmEvidenceUpload detecta MIME, valida tamaño y calcula/verifica hash (sección 8.1, paso 4) antes de que este status pase de pending_upload a uploaded/verified. replaces_asset_id conserva la referencia cuando una evidencia se reemplaza (sección 8.2: "evidencia reemplazada conserva referencia").';

create index evidence_assets_org_idx on evidence_assets (organization_id);
create index evidence_assets_upload_intent_idx on evidence_assets (upload_intent_id);

-- ===========================================================================
-- 12. evidence_links
-- ===========================================================================

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  asset_id uuid not null,
  entity_type text not null check (entity_type in ('case', 'inspection_result', 'finding')),
  entity_id uuid not null,
  purpose text,
  caption text,
  visibility text not null check (visibility in ('internal', 'customer', 'shared_case')),
  display_order integer not null default 0,
  actor_id uuid references auth.users (id),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (asset_id, organization_id) references evidence_assets (id, organization_id) on delete cascade
);

comment on table evidence_links is
  'Vincula un evidence_asset a case/inspection_result/finding con SU PROPIA visibility solicitada. La visibilidad EFECTIVA es min(evidence_assets.visibility_max, evidence_links.visibility) — nunca puede ampliar al asset (sección 8.3).';

create index evidence_links_asset_idx on evidence_links (asset_id);
create index evidence_links_entity_idx on evidence_links (entity_type, entity_id);
create index evidence_links_org_idx on evidence_links (organization_id);

-- ===========================================================================
-- 13. RLS + grants
-- ===========================================================================
-- Templates (1–4) son neutrales — mismo patrón que 0040 (`catalog.read` en
-- cualquier organización, vía has_permission_in_any_org, definido en 0040).
-- El resto es organization_id-scoped con inspection.read/evidence.read_*.
-- Evidencia interna: solo evidence.read_internal (o soporte elevado) lee
-- evidence_assets/evidence_links completos vía RLS de base — la
-- proyección "visible a Pass" (evidence.read_customer, filtrando por
-- visibilidad EFECTIVA) es responsabilidad de un query contract de fase
-- futura, igual que case_notes en 0050. RLS de base aquí protege
-- aislamiento de tenant, no sustituye ese filtro.

revoke all on inspection_templates, inspection_template_versions, inspection_template_sections,
  inspection_template_items, inspections, inspection_results, measurements, findings,
  maintenance_recommendations, upload_intents, evidence_assets, evidence_links
  from public, anon, authenticated;

alter table inspection_templates enable row level security;
alter table inspection_template_versions enable row level security;
alter table inspection_template_sections enable row level security;
alter table inspection_template_items enable row level security;
alter table inspections enable row level security;
alter table inspection_results enable row level security;
alter table measurements enable row level security;
alter table findings enable row level security;
alter table maintenance_recommendations enable row level security;
alter table upload_intents enable row level security;
alter table evidence_assets enable row level security;
alter table evidence_links enable row level security;

alter table inspection_templates force row level security;
alter table inspection_template_versions force row level security;
alter table inspection_template_sections force row level security;
alter table inspection_template_items force row level security;
alter table inspections force row level security;
alter table inspection_results force row level security;
alter table measurements force row level security;
alter table findings force row level security;
alter table maintenance_recommendations force row level security;
alter table upload_intents force row level security;
alter table evidence_assets force row level security;
alter table evidence_links force row level security;

grant select on inspection_templates to authenticated;
grant select on inspection_template_versions to authenticated;
grant select on inspection_template_sections to authenticated;
grant select on inspection_template_items to authenticated;
grant select on inspections to authenticated;
grant select on inspection_results to authenticated;
grant select on measurements to authenticated;
grant select on findings to authenticated;
grant select on maintenance_recommendations to authenticated;
grant select on upload_intents to authenticated;
grant select on evidence_assets to authenticated;
grant select on evidence_links to authenticated;

create policy inspection_templates_select on inspection_templates
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('inspection.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy inspection_template_versions_select on inspection_template_versions
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('inspection.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy inspection_template_sections_select on inspection_template_sections
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('inspection.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy inspection_template_items_select on inspection_template_items
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('inspection.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy inspections_select on inspections
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'inspection.read')
    or exists (
      select 1 from cases c
      where c.id = inspections.case_id
        and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy inspection_results_select on inspection_results
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'inspection.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy measurements_select on measurements
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'inspection.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy findings_select on findings
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'inspection.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy maintenance_recommendations_select on maintenance_recommendations
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'inspection.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy upload_intents_select on upload_intents
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'evidence.upload')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy evidence_assets_select on evidence_assets
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'evidence.read_internal')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy evidence_links_select on evidence_links
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'evidence.read_internal')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- ===========================================================================
-- 14. Seed — template de frenos versionado (sección 9 / R0-A sección 7.2)
-- ===========================================================================
-- Semilla de esta migración (no de supabase/seeds/): igual que el catálogo
-- neutral en 0040, este es dato de referencia global, no un fixture de un
-- taller. Idempotente vía ON CONFLICT. Debe coincidir EXACTAMENTE con
-- packages/domain/src/inspection/brakes-template.ts — ambos derivan de la
-- misma tabla literal de R0-A sección 7.2; si uno cambia, el otro debe
-- actualizarse en el mismo commit (no hay generador compartido para SQL en
-- esta fase, a diferencia de domain-spec.r0.yaml).

insert into inspection_templates (key, name, description) values
  ('brakes', 'Inspección de frenos', 'Template mínimo versionado — R0-A sección 7.2.')
on conflict (key) do nothing;

insert into inspection_template_versions (template_id, version_number, status)
select id, 1, 'active' from inspection_templates where key = 'brakes'
on conflict (template_id, version_number) do nothing;

insert into inspection_template_sections (template_version_id, key, label, display_order)
select v.id, s.key, s.label, s.display_order
from inspection_template_versions v
join inspection_templates t on t.id = v.template_id
cross join (values
  ('pads', 'Pastillas', 1),
  ('disc', 'Disco', 2),
  ('caliper', 'Cáliper', 3),
  ('guide_pins', 'Pines guía', 4),
  ('hoses', 'Mangueras/líneas', 5),
  ('fluid', 'Líquido', 6),
  ('parking_brake', 'Freno de estacionamiento', 7),
  ('pedal', 'Pedal', 8),
  ('road_test', 'Prueba de ruta', 9)
) as s(key, label, display_order)
where t.key = 'brakes' and v.version_number = 1
on conflict (template_version_id, key) do nothing;

insert into inspection_template_items (
  template_version_id, section_id, item_key, label, scope, requires_measurement, measurement_unit, display_order
)
select v.id, sec.id, i.item_key, i.label, i.scope, i.requires_measurement, i.measurement_unit, i.display_order
from inspection_template_versions v
join inspection_templates t on t.id = v.template_id
join inspection_template_sections sec on sec.template_version_id = v.id
cross join (values
  ('pads', 'pad_thickness_inner', 'Espesor de pastilla — interior', 'axle_side', true, 'mm', 1),
  ('pads', 'pad_thickness_outer', 'Espesor de pastilla — exterior', 'axle_side', true, 'mm', 2),
  ('disc', 'disc_thickness_measured', 'Espesor de disco — medido', 'axle_side', true, 'mm', 3),
  ('disc', 'disc_thickness_minimum', 'Espesor de disco — mínimo especificado', 'axle_side', true, 'mm', 4),
  ('disc', 'disc_surface_condition', 'Superficie del disco', 'axle_side', false, null, 5),
  ('caliper', 'caliper_condition', 'Condición del cáliper', 'axle_side', false, null, 6),
  ('guide_pins', 'guide_pins_condition', 'Condición de pines guía', 'axle_side', false, null, 7),
  ('hoses', 'hoses_condition', 'Condición de mangueras/líneas', 'axle_side', false, null, 8),
  ('fluid', 'fluid_condition', 'Nivel/condición del líquido de frenos', 'vehicle', false, null, 9),
  ('parking_brake', 'parking_brake_condition', 'Funcionamiento del freno de estacionamiento', 'vehicle', false, null, 10),
  ('pedal', 'pedal_result', 'Resultado de pedal', 'vehicle', false, null, 11),
  ('road_test', 'road_test_result', 'Resultado de prueba de ruta', 'vehicle', false, null, 12)
) as i(section_key, item_key, label, scope, requires_measurement, measurement_unit, display_order)
where t.key = 'brakes' and v.version_number = 1 and sec.key = i.section_key
on conflict (template_version_id, item_key) do nothing;
