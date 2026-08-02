-- Datatek — migración 0040: catálogo (R0-D Fase 1, ola `0040`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0020/0030 (ver sus cabeceras).
-- `implemented_pending_environment_evidence` hasta `pnpm db:reset && pnpm
-- test:db` con Docker disponible.
--
-- Fuente normativa: DATATEK_R0_D sección 6 (Catálogo) y R0-A sección 4.5 (4
-- tablas), 4.15 (contratos de experiencia — `price_mode` y sus
-- constraints EXACTOS, citados literalmente abajo).
--
-- Diseño: catálogo neutral, sin organization_id en items/versions —
-- sección 6: "catálogo neutral; UI lee de base; no existe arreglo
-- duplicado en frontend". Lo específico de una organización vive en
-- `service_catalog_overrides` (con organization_id). Una quote (R0-D ola
-- `0080`, no implementada aquí) guardará un snapshot de estos valores en el
-- momento del freeze — sección 6: "una quote guarda snapshot, no depende
-- de que el catálogo permanezca igual"; por eso ninguna tabla de esta
-- migración es referenciada directamente por una futura fila de quote,
-- solo copiada.

-- ===========================================================================
-- 1. service_catalog_items
-- ===========================================================================

create table service_catalog_items (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null check (btrim(category) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table service_catalog_items is
  'Catálogo neutral de servicios/diagnósticos. Sin organization_id — sección 6: "catálogo neutral".';

create trigger service_catalog_items_set_updated_at
  before update on service_catalog_items
  for each row execute function datatek_platform.set_updated_at();

create index service_catalog_items_category_idx on service_catalog_items (category);

-- ===========================================================================
-- 2. service_catalog_versions
-- ===========================================================================
-- Constraints citadas literalmente de R0-A sección 4.15:
--   "fixed requiere fixed_amount; from requiere from_amount; range
--   requiere mínimo y máximo, con min <= max; inspection_required y
--   diagnosis_required no requieren monto; moneda y escala siguen el value
--   object Money."

create table service_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references service_catalog_items (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  price_mode text not null check (
    price_mode in ('fixed', 'from', 'range', 'inspection_required', 'diagnosis_required')
  ),
  -- bigint en unidades menores (R0-A sección 4.14: "Dinero como bigint en
  -- unidades menores + moneda ISO"). Money (packages/domain) usa `number`
  -- del lado TypeScript por razones de serialización — ver el comentario en
  -- packages/domain/src/value-objects/money.ts — pero la columna real es
  -- bigint, tal como exige la convención.
  fixed_amount bigint check (fixed_amount is null or fixed_amount >= 0),
  from_amount bigint check (from_amount is null or from_amount >= 0),
  range_min bigint check (range_min is null or range_min >= 0),
  range_max bigint check (range_max is null or range_max >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  includes jsonb not null default '[]'::jsonb,
  excludes jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (catalog_item_id, version_number),
  check (effective_until is null or effective_until > effective_from),
  -- El bloque exacto de R0-A sección 4.15, un caso por price_mode:
  check (
    (
      price_mode = 'fixed'
      and fixed_amount is not null
      and from_amount is null and range_min is null and range_max is null
    ) or (
      price_mode = 'from'
      and from_amount is not null
      and fixed_amount is null and range_min is null and range_max is null
    ) or (
      price_mode = 'range'
      and range_min is not null and range_max is not null and range_min <= range_max
      and fixed_amount is null and from_amount is null
    ) or (
      price_mode in ('inspection_required', 'diagnosis_required')
      and fixed_amount is null and from_amount is null and range_min is null and range_max is null
    )
  ),
  -- currency es obligatoria exactamente cuando hay un monto que la necesite.
  check (
    (currency is not null)
    = (fixed_amount is not null or from_amount is not null or range_min is not null or range_max is not null)
  )
);

comment on table service_catalog_versions is
  'Versión con vigencia de un item. price_mode y sus constraints citan R0-A sección 4.15 literalmente.';

create index service_catalog_versions_item_idx on service_catalog_versions (catalog_item_id);
create index service_catalog_versions_active_idx
  on service_catalog_versions (catalog_item_id)
  where status = 'active';

-- ===========================================================================
-- 3. service_catalog_overrides
-- ===========================================================================
-- Mismas reglas de price_mode que service_catalog_versions — una
-- organización puede presentar su propio precio/condiciones para un item
-- neutral sin tocar el catálogo base.

create table service_catalog_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  catalog_item_id uuid not null references service_catalog_items (id) on delete cascade,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  price_mode text not null check (
    price_mode in ('fixed', 'from', 'range', 'inspection_required', 'diagnosis_required')
  ),
  fixed_amount bigint check (fixed_amount is null or fixed_amount >= 0),
  from_amount bigint check (from_amount is null or from_amount >= 0),
  range_min bigint check (range_min is null or range_min >= 0),
  range_max bigint check (range_max is null or range_max >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  includes jsonb not null default '[]'::jsonb,
  excludes jsonb not null default '[]'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  check (effective_until is null or effective_until > effective_from),
  check (
    (
      price_mode = 'fixed'
      and fixed_amount is not null
      and from_amount is null and range_min is null and range_max is null
    ) or (
      price_mode = 'from'
      and from_amount is not null
      and fixed_amount is null and range_min is null and range_max is null
    ) or (
      price_mode = 'range'
      and range_min is not null and range_max is not null and range_min <= range_max
      and fixed_amount is null and from_amount is null
    ) or (
      price_mode in ('inspection_required', 'diagnosis_required')
      and fixed_amount is null and from_amount is null and range_min is null and range_max is null
    )
  ),
  check (
    (currency is not null)
    = (fixed_amount is not null or from_amount is not null or range_min is not null or range_max is not null)
  )
);

comment on table service_catalog_overrides is
  'Presentación local de precio/condiciones por organización sobre un item neutral (sección 6: "overrides por organización").';

create index service_catalog_overrides_org_idx on service_catalog_overrides (organization_id);
create index service_catalog_overrides_item_idx on service_catalog_overrides (catalog_item_id);
create index service_catalog_overrides_active_idx
  on service_catalog_overrides (organization_id, catalog_item_id)
  where status = 'active';

-- ===========================================================================
-- 4. labor_operations
-- ===========================================================================

create table labor_operations (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  catalog_item_id uuid references service_catalog_items (id) on delete set null,
  name text not null check (btrim(name) <> ''),
  description text,
  standard_minutes numeric(6, 2) check (standard_minutes is null or standard_minutes >= 0),
  applies_to text check (
    applies_to is null
    or applies_to in ('front_axle', 'rear_axle', 'both_axles', 'vehicle')
  ),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table labor_operations is
  'Operaciones de mano de obra (sección 6: "operaciones de mano de obra"). catalog_item_id es opcional — una operación puede existir sin un item de precio propio.';

create trigger labor_operations_set_updated_at
  before update on labor_operations
  for each row execute function datatek_platform.set_updated_at();

create index labor_operations_catalog_item_idx on labor_operations (catalog_item_id);

-- ===========================================================================
-- 5. RLS + grants
-- ===========================================================================
-- Catálogo neutral: legible por cualquier actor con `catalog.read` activo
-- en AL MENOS una organización (no está atado a una sola, porque las
-- filas mismas no tienen organization_id). `service_catalog_overrides` SÍ
-- es por organización y usa el patrón estándar de 0010/0020/0030.

create function datatek_platform.has_permission_in_any_org(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from organization_memberships m
    where m.user_id = datatek_platform.current_actor()
      and m.status = 'active'
      and now() >= m.effective_from
      and (m.effective_until is null or now() < m.effective_until)
      and datatek_platform.has_org_permission(m.organization_id, p_permission)
  );
$$;

comment on function datatek_platform.has_permission_in_any_org(text) is
  'For tenant-neutral reference data only (catalog). Never used for a tenant-scoped table — those check one specific organization_id.';

revoke all on service_catalog_items, service_catalog_versions, service_catalog_overrides,
  labor_operations from public, anon, authenticated;
revoke all on function datatek_platform.has_permission_in_any_org(text) from public, anon, authenticated;
grant execute on function datatek_platform.has_permission_in_any_org(text) to authenticated;

alter table service_catalog_items enable row level security;
alter table service_catalog_versions enable row level security;
alter table service_catalog_overrides enable row level security;
alter table labor_operations enable row level security;

alter table service_catalog_items force row level security;
alter table service_catalog_versions force row level security;
alter table service_catalog_overrides force row level security;
alter table labor_operations force row level security;

grant select on service_catalog_items to authenticated;
grant select on service_catalog_versions to authenticated;
grant select on service_catalog_overrides to authenticated;
grant select on labor_operations to authenticated;

create policy service_catalog_items_select on service_catalog_items
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('catalog.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy service_catalog_versions_select on service_catalog_versions
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('catalog.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy labor_operations_select on labor_operations
  for select to authenticated
  using (
    datatek_platform.has_permission_in_any_org('catalog.read')
    or datatek_platform.has_active_platform_membership()
  );

create policy service_catalog_overrides_select on service_catalog_overrides
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'catalog.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

-- Ninguna tabla recibe insert/update/delete para `authenticated`/`anon` —
-- administrar el catálogo neutral es `platform.catalog.manage` (Control,
-- R0-A sección 4.5/13); overrides por organización usan `catalog.manage` a
-- través de un comando de aplicación, ninguno implementado en R0-D Fase 1.

-- ===========================================================================
-- 6. Seed mínimo (sección 6) — catálogo neutral, no un tenant
-- ===========================================================================
-- Igual que packages/domain/spec (permissions/roles): esta es referencia
-- global, no un fixture de un taller — vive en la migración, no en
-- supabase/seeds/local_actors.sql. Idempotente vía ON CONFLICT (key).
-- Demuestra las cinco modalidades de sección 4.15 sin universalizar monto
-- (sección 6: "sin precios presentados como universales" — cada monto está
-- atado a un item/organización concretos, ninguno se usa como tarifa
-- general de Datatek).

insert into service_catalog_items (key, category, name, description) values
  ('brakes-inspection-visual', 'brakes', 'Diagnóstico e inspección de frenos',
   'Revisión visual y medición de balatas/discos en las cuatro posiciones.'),
  ('brakes-pad-wear-check', 'brakes', 'Revisión de desgaste de balatas',
   'Verificación puntual de desgaste; el precio final depende de lo encontrado en sitio.'),
  ('brakes-axle-service-front', 'brakes', 'Servicio de frenos — eje delantero',
   'Cambio de balatas y revisión de disco en el eje delantero.'),
  ('brakes-axle-service-rear', 'brakes', 'Servicio de frenos — eje trasero',
   'Cambio de balatas y revisión de disco en el eje trasero; rango según condición encontrada.'),
  ('brakes-vibration-diagnosis', 'brakes', 'Diagnóstico de vibración al frenar',
   'Síntoma reportado por el cliente; requiere diagnóstico antes de cotizar.'),
  ('part-brake-pads-front-demo', 'parts', 'Balatas delanteras (demostrativo)',
   'Ítem demostrativo de repuesto — no es una recomendación de compra.')
on conflict (key) do nothing;

insert into service_catalog_versions (
  catalog_item_id, version_number, price_mode, fixed_amount, from_amount, range_min, range_max,
  currency, includes, status
)
select id, 1, 'fixed', 7500, null, null, null, 'GTQ', '["Revisión visual", "Medición de balatas y discos"]'::jsonb, 'active'
from service_catalog_items where key = 'brakes-inspection-visual'
on conflict (catalog_item_id, version_number) do nothing;

insert into service_catalog_versions (
  catalog_item_id, version_number, price_mode, fixed_amount, from_amount, range_min, range_max,
  currency, conditions, status
)
select id, 1, 'inspection_required', null, null, null, null, null,
  '["Precio se define después de inspección presencial"]'::jsonb, 'active'
from service_catalog_items where key = 'brakes-pad-wear-check'
on conflict (catalog_item_id, version_number) do nothing;

insert into service_catalog_versions (
  catalog_item_id, version_number, price_mode, fixed_amount, from_amount, range_min, range_max,
  currency, conditions, status
)
select id, 1, 'from', null, 45000, null, null, 'GTQ',
  '["Precio final depende de la marca de balata seleccionada"]'::jsonb, 'active'
from service_catalog_items where key = 'brakes-axle-service-front'
on conflict (catalog_item_id, version_number) do nothing;

insert into service_catalog_versions (
  catalog_item_id, version_number, price_mode, fixed_amount, from_amount, range_min, range_max,
  currency, conditions, status
)
select id, 1, 'range', null, null, 40000, 60000, 'GTQ',
  '["Rango según desgaste de disco encontrado en sitio"]'::jsonb, 'active'
from service_catalog_items where key = 'brakes-axle-service-rear'
on conflict (catalog_item_id, version_number) do nothing;

insert into service_catalog_versions (
  catalog_item_id, version_number, price_mode, fixed_amount, from_amount, range_min, range_max,
  currency, conditions, status
)
select id, 1, 'diagnosis_required', null, null, null, null, null,
  '["No se cotiza sin diagnóstico previo"]'::jsonb, 'active'
from service_catalog_items where key = 'brakes-vibration-diagnosis'
on conflict (catalog_item_id, version_number) do nothing;

insert into service_catalog_versions (
  catalog_item_id, version_number, price_mode, fixed_amount, from_amount, range_min, range_max,
  currency, status
)
select id, 1, 'fixed', 32000, null, null, null, 'GTQ', 'active'
from service_catalog_items where key = 'part-brake-pads-front-demo'
on conflict (catalog_item_id, version_number) do nothing;

insert into labor_operations (key, catalog_item_id, name, standard_minutes, applies_to)
select 'labor-brakes-inspection', id, 'Inspección de frenos (las 4 posiciones)', 30, 'vehicle'
from service_catalog_items where key = 'brakes-inspection-visual'
on conflict (key) do nothing;

insert into labor_operations (key, catalog_item_id, name, standard_minutes, applies_to)
select 'labor-brake-pad-replacement-front-axle', id, 'Reemplazo de balatas — eje delantero', 45, 'front_axle'
from service_catalog_items where key = 'brakes-axle-service-front'
on conflict (key) do nothing;

insert into labor_operations (key, catalog_item_id, name, standard_minutes, applies_to)
select 'labor-brake-pad-replacement-rear-axle', id, 'Reemplazo de balatas — eje trasero', 45, 'rear_axle'
from service_catalog_items where key = 'brakes-axle-service-rear'
on conflict (key) do nothing;
