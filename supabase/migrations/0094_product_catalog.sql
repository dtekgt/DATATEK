-- Datatek — migración 0094: catálogo de productos (repuestos/piezas).
--
-- Continúa 0040_catalog.sql (servicios) con la contraparte para vender
-- productos específicos, no solo mano de obra. Decisión de diseño
-- deliberada, distinta de servicios:
--
--   Servicios (0040): catálogo NEUTRAL — "cambio de aceite" es el mismo
--   concepto en cualquier taller, así que vive sin organization_id con
--   overrides por organización solo para precio.
--
--   Productos (aquí): NO hay una taxonomía neutral realista — un repuesto
--   es cualquier SKU de cualquier marca para cualquier modelo, y el
--   inventario real (qué tiene EN EXISTENCIA cada taller) es un hecho de
--   esa organización, no un concepto compartido. product_catalog_items
--   nace directamente con organization_id, siguiendo el patrón estándar de
--   0020/0030/0050 (RLS con has_org_permission + rama de plataforma
--   elevada), no el patrón neutral de 0040.
--
-- quote_items (0080_quote_authorization.sql línea 152/162) ya admite
-- line_type='part' y source_type='catalog_item' con un source_id uuid sin
-- FK — el mismo patrón "snapshot, no depende de que el catálogo permanezca
-- igual" que usan los servicios. No se modifica 0080: una quote que cite un
-- producto de aquí simplemente copia sus valores en el momento del freeze,
-- igual que ya hace con service_catalog_versions.

-- ===========================================================================
-- 1. product_catalog_items
-- ===========================================================================

create table product_catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  sku text,
  category text not null check (btrim(category) <> ''),
  name text not null check (btrim(name) <> ''),
  description text,
  brand text,
  part_number text,
  -- Unidad de venta: la mayoría de repuestos se venden por pieza, pero
  -- aceite/refrigerante se venden por litro, empaques por juego, etc.
  unit text not null default 'unidad' check (btrim(unit) <> ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table product_catalog_items is
  'Producto/repuesto específico de una organización — a diferencia de service_catalog_items, nace con organization_id: no existe una taxonomía neutral realista de SKUs de repuestos.';

create trigger product_catalog_items_set_updated_at
  before update on product_catalog_items
  for each row execute function datatek_platform.set_updated_at();

create index product_catalog_items_org_idx on product_catalog_items (organization_id);
create index product_catalog_items_category_idx on product_catalog_items (organization_id, category);
-- SKU es opcional (un taller puede catalogar un producto antes de asignarle
-- código), pero cuando existe no puede repetirse dentro de la misma
-- organización.
create unique index product_catalog_items_org_sku_key
  on product_catalog_items (organization_id, sku)
  where sku is not null;

alter table product_catalog_items add constraint product_catalog_items_id_org_unique
  unique (id, organization_id);

-- ===========================================================================
-- 2. product_catalog_versions
-- ===========================================================================
-- Mismo contrato de precio que service_catalog_versions (R0-A sección
-- 4.15, constraints citadas literalmente) — reutilizado tal cual, no
-- reinventado, porque es el mismo value object Money en todo el sistema.
-- Se agrega quantity_on_hand, que un servicio no necesita (la mano de obra
-- no se agota; un repuesto físico sí). Se omiten includes/excludes/
-- conditions de 0040: no aplican a la venta de una pieza física.

create table product_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  catalog_item_id uuid not null,
  version_number integer not null check (version_number > 0),
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
  -- Cantidad decimal con escala explícita (R0-A sección 4.14: "cantidades
  -- decimales con escala explícita; nunca float"), igual que
  -- quote_items.quantity — un litro de aceite puede ser 0.5, no solo enteros.
  quantity_on_hand numeric(12, 3) not null default 0 check (quantity_on_hand >= 0),
  status text not null default 'active' check (status in ('draft', 'active', 'retired')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (catalog_item_id, organization_id)
    references product_catalog_items (id, organization_id) on delete cascade,
  unique (catalog_item_id, version_number),
  check (effective_until is null or effective_until > effective_from),
  -- El bloque exacto de R0-A sección 4.15, idéntico al de
  -- service_catalog_versions — un caso por price_mode.
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

comment on table product_catalog_versions is
  'Versión con vigencia y existencia de un producto. Mismo contrato de price_mode que service_catalog_versions (R0-A sección 4.15); quantity_on_hand es lo único que un servicio no tiene.';

create index product_catalog_versions_item_idx on product_catalog_versions (catalog_item_id);
create index product_catalog_versions_org_idx on product_catalog_versions (organization_id);
create index product_catalog_versions_active_idx
  on product_catalog_versions (organization_id, catalog_item_id)
  where status = 'active';

-- ===========================================================================
-- 3. RLS + grants
-- ===========================================================================
-- Patrón estándar por-organización (0020/0030/0050), NO el patrón neutral
-- de 0040 — corregido para exigir sesión elevada en la rama de plataforma
-- desde el inicio (la lección de 0092: nunca `has_active_platform_membership()`
-- suelta en una tabla con organization_id real).

revoke all on product_catalog_items, product_catalog_versions from public, anon, authenticated;

alter table product_catalog_items enable row level security;
alter table product_catalog_versions enable row level security;
alter table product_catalog_items force row level security;
alter table product_catalog_versions force row level security;

grant select on product_catalog_items to authenticated;
grant select on product_catalog_versions to authenticated;
grant insert, update on product_catalog_items to authenticated;
grant insert, update on product_catalog_versions to authenticated;

create policy product_catalog_items_select on product_catalog_items
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'parts.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy product_catalog_items_insert on product_catalog_items
  for insert to authenticated
  with check (datatek_platform.has_org_permission(organization_id, 'parts.manage'));

create policy product_catalog_items_update on product_catalog_items
  for update to authenticated
  using (datatek_platform.has_org_permission(organization_id, 'parts.manage'))
  with check (datatek_platform.has_org_permission(organization_id, 'parts.manage'));

create policy product_catalog_versions_select on product_catalog_versions
  for select to authenticated
  using (
    datatek_platform.has_org_permission(organization_id, 'parts.read')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(organization_id)
    )
  );

create policy product_catalog_versions_insert on product_catalog_versions
  for insert to authenticated
  with check (datatek_platform.has_org_permission(organization_id, 'parts.manage'));

create policy product_catalog_versions_update on product_catalog_versions
  for update to authenticated
  using (datatek_platform.has_org_permission(organization_id, 'parts.manage'))
  with check (datatek_platform.has_org_permission(organization_id, 'parts.manage'));
