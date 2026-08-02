-- Datatek — migración 0087: identidad documental (R0-D Fase 4a, ola `0087`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0000–0086 (ver sus cabeceras). Esta sandbox no tiene Docker
-- Desktop ni Supabase CLI ejecutable localmente. El SQL es completo y se
-- considera correcto por revisión estática; su ejecución contra Postgres
-- real queda como `implemented_pending_environment_evidence`.
--
-- Fuente normativa: DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md sección 1
-- (tabla de olas: "0087: identidad/snapshot sin generación falsa") y
-- sección 18 (documentación); DATATEK_R0_A_CONTRACT_PACK.md sección 4.12
-- literal — "R0 no genera todavía PDFs/Excel finales. Estas dos tablas
-- conservan identidad, snapshot, versión, hash y estado para que R2 no
-- cambie el modelo central." — y sección 11 completa (contrato de
-- reporting): 11.1 (campos), 11.2 (proyección cliente), 11.3 (proyección
-- interna), 11.4 (alcance R0: "no genera PDF/Excel final... no muestra
-- botones que aparenten haber generado un documento").
--
-- NOTA HONESTA — esta ola es SOLO schema. A diferencia de `0080`/`0086`,
-- R0-D Fase 4a no agrega ningún comando de aplicación ni fila en
-- `CrmVehicleState` (packages/application/src/commands/state.ts) para
-- `documents`/`document_versions` — no existe todavía un
-- `RequestDocument`/`GenerateDocument` que las escriba. El motivo es
-- doble: (1) el alcance explícito de esta fase pide justo eso ("R0 nunca
-- llega a ready con un archivo real"); (2) sin ExcelJS/generador real
-- instalado (sección 11.4: "no instala ExcelJS hasta R2"), cualquier
-- comando que las escribiera solo podría dejarlas en 'requested' de forma
-- permanente — preferible documentarlo como pendiente explícito (mismo
-- precedente que `case_blockers`/`resource_schedules` en 0060, ver
-- docs/domain/unwritten-tables.md) que fingir una función a medias.
--
-- Diseño — dos tablas, mismo patrón que `quotes`/`quote_versions` (0080):
-- `documents` es identidad/agrupador estable (qué documento es, de qué caso,
-- para qué audiencia); `document_versions` es el lifecycle real
-- (`requested -> generating -> ready|failed`, y `ready -> replaced` cuando
-- una corrección produce una versión nueva) con snapshot/hash/archivo. Una
-- misma `documents` row puede acumular varias `document_versions` a lo
-- largo del tiempo, igual que una `quotes` acumula `quote_versions`.
--
-- Diseño — audiencia en el documento, no solo en el contenido: sección 11.2
-- vs 11.3 son proyecciones DISTINTAS (cliente nunca ve costo/margen/
-- proveedor/notas internas/sesiones de soporte/metadata de seguridad). En
-- vez de un único documento con "campos condicionalmente visibles", cada
-- `documents` row declara su audiencia (`customer` o `internal`) desde que
-- se solicita — un documento de auditoría interna nunca se confunde con el
-- resumen que un cliente podría ver.

-- ===========================================================================
-- 1. documents
-- ===========================================================================

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  case_id uuid not null,
  -- p. ej. 'customer_authorization_summary', 'internal_case_audit_report' —
  -- sección 11.1 "tipo". Catálogo abierto (texto), no un enum físico: R0 no
  -- fija todavía la lista completa de tipos de documento que R2 emitirá.
  document_type text not null check (btrim(document_type) <> ''),
  audience text not null check (audience in ('customer', 'internal')),
  -- Entidad origen (sección 11.1) — p. ej. ('authorization', authorization_id)
  -- o ('quote_version', quote_version_id). Sin FK física: el origen varía
  -- por tipo de documento, igual que domain_events.aggregate_type/aggregate_id
  -- en 0085.
  source_entity_type text not null check (btrim(source_entity_type) <> ''),
  source_entity_id uuid not null,
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  -- Fecha de negocio, NUNCA sustituida por created_at (sección 4.14:
  -- "created_at no reemplaza... fecha comercial").
  business_date date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (case_id, organization_id) references cases (id, organization_id) on delete cascade,
  unique (id, organization_id)
);

comment on table documents is
  'Identidad/agrupador de documento (sección 11.1, ola 0087) — el lifecycle real vive en document_versions. R0 no genera PDF/Excel final (sección 11.4).';

create index documents_org_idx on documents (organization_id);
create index documents_case_idx on documents (case_id);
create index documents_source_idx on documents (source_entity_type, source_entity_id);

-- ===========================================================================
-- 2. document_versions
-- ===========================================================================

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null,
  version_number integer not null check (version_number > 0),
  template_key text not null check (btrim(template_key) <> ''),
  template_version integer not null check (template_version > 0),
  status text not null default 'requested'
    check (status in ('requested', 'generating', 'ready', 'failed', 'replaced')),
  -- Snapshot canónico de lo que el documento describiría — mismo principio
  -- que quote_versions.snapshot_json (sección 9.2): construido una vez,
  -- nunca recalculado desde filas que pudieron cambiar después.
  snapshot jsonb,
  hash text check (hash is null or hash ~ '^[0-9a-f]{64}$'),
  -- Archivo real — sección 11.4: en R0 estas tres columnas nunca se llenan
  -- (ningún estado llega a 'ready' con un archivo real detrás).
  file_bucket text,
  file_path text,
  generated_at timestamptz,
  failure_reason text,
  replaced_at timestamptz,
  -- "documento reemplazado; motivo de corrección" (sección 11.1) — apunta a
  -- la versión que lo sustituyó, mismo patrón que
  -- quote_versions.superseded_by_version_id (0080).
  replaced_by_version_id uuid references document_versions (id),
  replace_reason text,
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (document_id, organization_id) references documents (id, organization_id) on delete cascade,
  unique (document_id, version_number),
  unique (id, organization_id),
  check (status <> 'ready' or (
    generated_at is not null and hash is not null
    and file_bucket is not null and file_path is not null
  )),
  check (status <> 'failed' or failure_reason is not null),
  check (status <> 'replaced' or (replaced_at is not null and replaced_by_version_id is not null)),
  check (replaced_by_version_id is null or replaced_by_version_id <> id)
);

comment on table document_versions is
  'Lifecycle real: requested -> generating -> ready|failed, y ready -> replaced en una corrección (sección 11.1). En R0 ninguna fila alcanza ready con archivo real (sección 11.4) — no hay comando de aplicación que las escriba todavía (ver cabecera del archivo).';

create index document_versions_document_idx on document_versions (document_id);
create index document_versions_org_status_idx on document_versions (organization_id, status);

-- ===========================================================================
-- 3. RLS + grants
-- ===========================================================================
-- Mismo principio que 0020–0086: RLS habilitada y forzada; ninguna policy
-- de insert/update/delete para `authenticated` (sin comando que escriba
-- estas tablas todavía en R0 de todas formas — ver cabecera). Lectura:
-- staff con quote.read ve documentos de su organización; un cliente
-- vinculado al caso SOLO ve documentos con audience='customer' (sección
-- 11.2 vs 11.3 — la proyección interna nunca llega a un cliente, ni
-- siquiera como fila visible); soporte elevado ve dentro de su sesión
-- activa.

revoke all on documents, document_versions from public, anon, authenticated;

alter table documents enable row level security;
alter table document_versions enable row level security;

alter table documents force row level security;
alter table document_versions force row level security;

grant select on documents to authenticated;
grant select on document_versions to authenticated;

create policy documents_select on documents
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'quote.read')
    or (
      audience = 'customer'
      and exists (
        select 1 from cases c
        where c.id = documents.case_id
          and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
      )
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy document_versions_select on document_versions
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'quote.read')
    or exists (
      select 1 from documents d
      where d.id = document_versions.document_id
        and d.audience = 'customer'
        and exists (
          select 1 from cases c
          where c.id = d.case_id
            and datatek_platform.actor_is_linked_customer(c.customer_id, c.organization_id)
        )
    )
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated` o `anon`:
-- toda mutación pasaría por un comando de aplicación con Service Role
-- (sección 6.1 R0-C) — ese comando no existe todavía en R0 (ver cabecera).
