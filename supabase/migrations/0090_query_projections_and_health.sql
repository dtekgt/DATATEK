-- Datatek — migración 0090: proyecciones de lectura y salud (R0-E
-- hardening Fase 1, ola `0090`).
--
-- Estado de esta sesión: artefacto AUTORIZADO PERO NO EJECUTADO — misma
-- situación que 0000–0087 (ver sus cabeceras). Esta sandbox no tiene Docker
-- Desktop ni Supabase CLI ejecutable localmente (ver
-- docs/runbooks/database-reset.md). El SQL es completo y se considera
-- correcto por revisión estática; su ejecución contra Postgres real queda
-- como `implemented_pending_environment_evidence` hasta que una sesión
-- futura con Docker corra `pnpm db:reset && pnpm test:db`.
--
-- Fuente normativa: DATATEK_R0_E_HARDENING_HANDOFF.md sección 2 ("ola
-- 0090") — lista exactamente lo que esta ola PUEDE incluir (views
-- security_invoker, funciones de lectura estrechas, query contracts,
-- índices medidos, checks de drift, proyecciones de timeline, funciones de
-- health no sensibles) y lo que NO (activar RLS por primera vez en tablas
-- anteriores, materialized views sin medición, duplicar reglas de negocio
-- en vistas, exponer PII, rescatar migraciones anteriores). Ninguna fila de
-- este archivo toca `0000`–`0087`: solo agrega objetos nuevos (views,
-- funciones, índices, una columna nullable) sobre tablas que esas
-- migraciones ya crearon con su RLS/grants completos.
--
-- ===========================================================================
-- "Reflejar, no reinventar" — mapeo explícito a los 8 query contracts
-- ===========================================================================
-- packages/application/src/queries/*.ts (R0-D Fase 4a) son funciones PURAS
-- `(CrmVehicleState, QueryContext, ...) -> ViewModel | null` que hoy leen el
-- motor de fixtures en memoria. Esta ola NO reimplementa esas funciones en
-- SQL — reimplementar su lógica DERIVADA (la escalera de prioridad de
-- `deriveVehicleNowFact`, la tabla de `deriveNextAction`, el truncamiento a
-- 3 de `getImmediateDecisions`, el cálculo de `evidenceCount` con
-- visibilidad efectiva) sería exactamente "duplicar reglas del dominio en
-- vistas" — prohibido en sección 2. Lo que SÍ hace esta ola es surtir, como
-- views/funciones ESTRECHAS, los mismos patrones de JOIN/filtro/"última
-- fila por grupo" que esas funciones YA repiten sobre datos crudos —
-- dejando toda interpretación (qué significa, qué prioridad tiene, qué
-- texto mostrar) exactamente donde vive hoy: TypeScript. Cuando Fase 4b
-- conecte estas funciones a Postgres real, seguirán decidiendo en
-- TypeScript; solo la lectura de filas candidatas podrá apoyarse en estos
-- objetos en vez de reconstruir el mismo JOIN cada vez.
--
-- | Objeto | Refleja (archivo, patrón exacto) |
-- |---|---|
-- | `case_latest_status_event` | `pass-case.ts`: `caseStatusEvents.filter(caseId).sort(occurredAt desc)[0]` |
-- | `case_active_assignment` | `pro-case-experience.ts`, `latestActiveAssignment`: última fila activa por (caseId, role) |
-- | `inspection_latest_completed` | `vehicle-now.ts` + `case-proof-summary.ts`: última inspección `completed` por caso |
-- | `quote_version_frozen_current` | `pro-case-experience.ts` + `case-proof-summary.ts`: `versions.find(status === 'frozen')` |
-- | `authorization_request_live` | `pro-case-experience.ts` + `immediate-decisions.ts`: `LIVE_REQUEST_STATUSES` |
-- | `vehicle_access_grant_active` | `pass-home.ts`: `vehicleAccessGrants.filter(revokedAt == null)` |
-- | `case_timeline_events` | comentario de `authorization_events` en 0080: "para timeline compartido Pro/Pass" |
-- | `service_catalog_item_active_price` | `service-price-presentation.ts`: precio activo aplanado (ver sección 3 abajo) |
-- | `datatek_platform.is_visible_to_audience` | `queries/shared.ts`, `isVisibleToAudience` — 1:1, función de una línea |
--
-- `getNextService` (`next-service.ts`) no recibe view propia: lee
-- `maintenance_recommendations` filtrado por `vehicle_id`/`organization_id`
-- sin ningún JOIN ni "última fila por grupo" — el índice
-- `maintenance_recommendations_vehicle_idx` (0070) ya cubre ese acceso
-- directo. Agregar una view de un solo `select *` no reflejaría nada que
-- el propio query no exprese ya con una sola línea; se documenta como "no
-- aplica", no como omisión silenciosa.
--
-- Todas las views usan `with (security_invoker = true)` — nunca
-- `security_definer` (sección 2: "no `security_definer` — riesgo de bypass
-- de RLS"). Una view `security_invoker` ejecuta con los privilegios de
-- QUIEN CONSULTA, así que las policies RLS de `0020`–`0087` sobre las
-- tablas base se siguen aplicando fila por fila exactamente igual que si el
-- cliente hubiera consultado la tabla directamente — la view solo evita que
-- cada consumidor reescriba el mismo JOIN/filtro.

-- ===========================================================================
-- 1. Views de lectura estrecha — security_invoker
-- ===========================================================================

create view case_latest_status_event
with (security_invoker = true)
as
select distinct on (e.case_id)
  e.id,
  e.organization_id,
  e.case_id,
  e.from_status,
  e.to_status,
  e.reason,
  e.actor_id,
  e.occurred_at
from case_status_events e
order by e.case_id, e.occurred_at desc, e.created_at desc;

comment on view case_latest_status_event is
  'Última fila de case_status_events por caso — refleja pass-case.ts (getPassCase, "latestEvent"). No decide qué status "significa"; ese texto (friendlyCaseStatus) sigue en TypeScript.';

create view case_active_assignment
with (security_invoker = true)
as
select distinct on (a.case_id, a.role)
  a.id,
  a.organization_id,
  a.case_id,
  a.role,
  a.user_id,
  a.assigned_at
from case_assignments a
where a.unassigned_at is null
order by a.case_id, a.role, a.assigned_at desc;

comment on view case_active_assignment is
  'Última asignación ACTIVA por (case_id, role) — refleja pro-case-experience.ts, latestActiveAssignment(). Nunca resuelve un nombre humano (no hay user_profiles en este motor); userId crudo, igual que el query TypeScript.';

create view inspection_latest_completed
with (security_invoker = true)
as
select distinct on (i.case_id)
  i.id,
  i.organization_id,
  i.case_id,
  i.vehicle_id,
  i.completed_at,
  i.completed_by
from inspections i
where i.status = 'completed' and i.completed_at is not null
order by i.case_id, i.completed_at desc;

comment on view inspection_latest_completed is
  'Última inspección completed por caso — refleja el MISMO filtro+orden que vehicle-now.ts (deriveVehicleNowFact) y case-proof-summary.ts repiten cada uno por su cuenta. No decide "vencido" vs "sin alertas" — ese umbral (STALE_AFTER_DAYS) es interpretación, sigue en TypeScript.';

create view quote_version_frozen_current
with (security_invoker = true)
as
select
  v.id,
  v.organization_id,
  v.quote_id,
  v.case_id,
  v.version_number,
  v.currency,
  v.subtotal_minor,
  v.total_minor,
  v.snapshot_hash,
  v.frozen_at
from quote_versions v
where v.status = 'frozen';

comment on view quote_version_frozen_current is
  'Versión(es) frozen por quote — refleja pro-case-experience.ts y case-proof-summary.ts: versions.find(status === "frozen"). En la práctica hay a lo sumo una fila por quote_id (createQuoteVersion supersede la frozen anterior al crear una nueva), pero esta ola no agrega un constraint UNIQUE nuevo sobre 0080 — eso sería alterar el modelo de una migración cerrada, no reflejar un query existente.';

create view authorization_request_live
with (security_invoker = true)
as
select
  r.id,
  r.organization_id,
  r.case_id,
  r.quote_version_id,
  r.audience_customer_id,
  r.status,
  r.expires_at,
  r.prepared_at,
  r.sent_at
from authorization_requests r
where r.status in ('prepared', 'sent', 'viewed');

comment on view authorization_request_live is
  'Solicitudes "vigentes" — refleja LIVE_REQUEST_STATUSES, repetido idéntico en pro-case-experience.ts y immediate-decisions.ts. Distinto del índice parcial authorization_requests_pending_idx (0080), que está keyed por quote_version_id: ambos queries TypeScript filtran por case_id, no por versión — ver el índice nuevo en la sección 4.';

create view vehicle_access_grant_active
with (security_invoker = true)
as
select
  g.id,
  g.organization_id,
  g.vehicle_id,
  g.granted_to_customer_id,
  g.scope,
  g.source,
  g.created_at
from vehicle_access_grants g
where g.revoked_at is null;

comment on view vehicle_access_grant_active is
  'Grants no revocados — refleja pass-home.ts (getPassHome): "activeGrants". La regla "VIN/placa no otorgan lectura" (0030) sigue intacta: esta view solo filtra revoked_at, nunca une por vehicle_identifiers.';

create view case_timeline_events
with (security_invoker = true)
as
select
  e.id,
  e.organization_id,
  e.case_id,
  'case_status' as event_source,
  e.to_status as event_key,
  e.reason as detail,
  e.actor_id,
  e.occurred_at
from case_status_events e
union all
select
  a.id,
  a.organization_id,
  a.case_id,
  'authorization' as event_source,
  a.event_type as event_key,
  null as detail,
  a.actor_id,
  a.occurred_at
from authorization_events a;

comment on view case_timeline_events is
  'Proyección de timeline (sección 2: "proyecciones de timeline") — une, sin interpretar, los dos eventos append-only especializados que 0050/0080 ya declaran para esto (ver el comentario de authorization_events en 0080: "para timeline compartido Pro/Pass"). event_key es el valor crudo del enum (to_status / event_type) — nunca una etiqueta amigable; eso sigue siendo trabajo de friendlyCaseStatus/equivalente en TypeScript. RLS de cada tabla base se aplica por separado a cada mitad del UNION ALL: un cliente vinculado ve sus propias filas de case_status; NINGUNA fila de authorization_events (esa tabla no tiene policy para cliente vinculado, sección 10 de 0080) — la view no amplía esa visibilidad, solo la respeta fila por fila.';

create view service_catalog_item_active_price
with (security_invoker = true)
as
select distinct on (i.id)
  i.id,
  i.key,
  i.name,
  v.price_mode,
  v.fixed_amount as fixed_amount_minor,
  v.from_amount as from_amount_minor,
  v.range_min as range_min_amount_minor,
  v.range_max as range_max_amount_minor,
  v.currency
from service_catalog_items i
join service_catalog_versions v on v.catalog_item_id = i.id
where v.status = 'active'
  and now() >= v.effective_from
  and (v.effective_until is null or now() < v.effective_until)
order by i.id, v.version_number desc;

comment on view service_catalog_item_active_price is
  'Precio activo aplanado item+versión — refleja service-price-presentation.ts, que lee ServiceCatalogItemRow (commands/state.ts) como una fila ya aplanada por el fixture. "Activa" usa exactamente el mismo criterio que service_catalog_versions_active_idx (0040) ya indexa: status=active y vigencia por fecha — un hecho de datos, no una interpretación nueva. NO incluye un campo "note": el texto de condiciones para inspection_required/diagnosis_required es copy de presentación (Fase 4b), no una columna 1:1 en 0040 — se omite en vez de inventar una transformación de conditions -> note aquí.';

-- ===========================================================================
-- 2. Función de lectura estrecha — filtro de audiencia (reflejo 1:1)
-- ===========================================================================
-- Refleja EXACTAMENTE queries/shared.ts, isVisibleToAudience — una función
-- de una línea, sin acceso a tablas, así que NO necesita security definer:
-- ejecuta con los privilegios de quien la llama, igual que cualquier
-- función SQL pura.

create function datatek_platform.is_visible_to_audience(p_visibility text, p_audience text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case when p_audience = 'pro' then true else p_visibility = 'customer' end;
$$;

comment on function datatek_platform.is_visible_to_audience(text, text) is
  'Espejo 1:1 de isVisibleToAudience (packages/application/src/queries/shared.ts) — "pro" ve todo; "pass"/"guest" solo visibility=customer. No decide nada más allá de esa regla ya escrita en TypeScript.';

revoke all on function datatek_platform.is_visible_to_audience(text, text) from public, anon, authenticated;
grant execute on function datatek_platform.is_visible_to_audience(text, text) to authenticated;

-- ===========================================================================
-- 3. Check de drift — folio por organización
-- ===========================================================================
-- Compara el contador atómico (organization_counters, vía
-- datatek_platform.next_organization_counter — 0050) contra el folio
-- máximo REALMENTE emitido en `cases` para esa organización. Los dos deben
-- coincidir (next_value = max(folio_number) + 1); si no, algo escribió un
-- folio sin pasar por el contador, o viceversa — un hallazgo operativo, no
-- una corrección automática (esta función solo LEE, nunca ajusta el
-- contador). CASE_FOLIO_COUNTER_KEY = 'case_folio' — mismo literal que
-- packages/application/src/commands/intake-commands.ts.

create function datatek_platform.case_folio_counter_drift(p_organization_id uuid)
returns table (
  expected_next_folio bigint,
  max_issued_folio bigint,
  drifted boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Mismo gate que cualquier lectura de auditoría/organización — una
  -- función security definer nunca se abre a cualquier autenticado solo
  -- porque puede leer todas las filas; el permiso se revisa aquí, dentro
  -- de la función, igual que 0040/0080 ya hacen para sus propios helpers.
  if not (
    datatek_platform.has_org_permission(p_organization_id, 'audit.read_organization')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(p_organization_id)
    )
  ) then
    return; -- cero filas — mismo principio silencioso que RLS ya aplica en el resto del esquema, sin exponer que el organization_id existe.
  end if;

  return query
  select
    coalesce(
      (select next_value from organization_counters
       where organization_id = p_organization_id and counter_key = 'case_folio'),
      1
    ) as expected_next_folio,
    coalesce(
      (select max(folio_number) from cases where organization_id = p_organization_id),
      0
    ) as max_issued_folio,
    coalesce(
      (select next_value from organization_counters
       where organization_id = p_organization_id and counter_key = 'case_folio'),
      1
    ) <> coalesce(
      (select max(folio_number) from cases where organization_id = p_organization_id),
      0
    ) + 1 as drifted;
end;
$$;

comment on function datatek_platform.case_folio_counter_drift(uuid) is
  'Check de drift de solo lectura (sección 2: "checks de drift si aplica") entre organization_counters y el folio máximo real en cases, por organización. Nunca corrige — solo reporta expected_next_folio/max_issued_folio/drifted. Gated por audit.read_organization o soporte elevado, igual que cualquier lectura de auditoría.';

revoke all on function datatek_platform.case_folio_counter_drift(uuid) from public, anon, authenticated;
grant execute on function datatek_platform.case_folio_counter_drift(uuid) to authenticated;

-- ===========================================================================
-- 4. Función de health no sensible — outbox
-- ===========================================================================
-- Sección 13: "Health: ... outbox lag". Solo conteos y una edad en
-- segundos — nunca el payload de un mensaje, nunca last_error, nunca
-- locked_by (sección 2: "sin exponer configuración interna"). outbox_messages
-- no tiene grant de select para `authenticated` (0085, a propósito) —esta
-- función SÍ necesita security definer para poder agregar sobre ella, con
-- el mismo gate de permiso de auditoría que el check de drift de arriba.

create function datatek_platform.outbox_health(p_organization_id uuid)
returns table (
  pending_count bigint,
  processing_count bigint,
  dead_count bigint,
  oldest_pending_seconds double precision
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (
    datatek_platform.has_org_permission(p_organization_id, 'audit.read_organization')
    or (
      datatek_platform.has_active_platform_membership()
      and datatek_platform.has_active_support_session(p_organization_id)
    )
  ) then
    return;
  end if;

  return query
  select
    count(*) filter (where status = 'pending')::bigint,
    count(*) filter (where status = 'processing')::bigint,
    count(*) filter (where status = 'dead')::bigint,
    extract(epoch from (now() - min(created_at) filter (where status in ('pending', 'processing'))))
  from outbox_messages
  where organization_id = p_organization_id;
end;
$$;

comment on function datatek_platform.outbox_health(uuid) is
  'Health no sensible de outbox (sección 13) — solo conteos por estado y edad del pendiente más viejo. Nunca expone payload/last_error/locked_by. R0 no tiene worker que procese outbox_messages todavía (0085) — pending_count/dead_count siempre reflejan solo lo que un comando de aplicación insertó, nunca actividad de un worker inexistente.';

revoke all on function datatek_platform.outbox_health(uuid) from public, anon, authenticated;
grant execute on function datatek_platform.outbox_health(uuid) to authenticated;

-- ===========================================================================
-- 5. Índices — cada uno justificado por un patrón real y repetido en
--    packages/application/src/queries/*.ts, no especulativo.
-- ===========================================================================

-- vehicle-now.ts (deriveVehicleNowFact) Y case-proof-summary.ts filtran
-- inspections por case_id + status='completed' + completedAt no nulo,
-- ordenando por completedAt desc — el MISMO filtro+orden en dos query
-- contracts independientes. inspections ya tiene inspections_case_idx
-- (0070, solo case_id) pero no cubre status/orden.
create index inspections_case_completed_idx
  on inspections (case_id, completed_at desc)
  where status = 'completed';

-- pro-case-experience.ts y case-proof-summary.ts hacen
-- quoteVersions.find(v => v.quoteId === X && v.status === 'frozen').
-- quote_versions ya tiene quote_versions_quote_idx (0080, solo quote_id) y
-- quote_versions_org_status_idx (organization_id, status) — ninguno cubre
-- "frozen de ESTE quote" directamente.
create index quote_versions_quote_frozen_idx
  on quote_versions (quote_id)
  where status = 'frozen';

-- pro-case-experience.ts (deriveWaitingAuthorizationAction) e
-- immediate-decisions.ts filtran authorizationRequests por case_id +
-- LIVE_REQUEST_STATUSES. authorization_requests_pending_idx (0080) ya cubre
-- el mismo conjunto de estados pero keyed por quote_version_id — un acceso
-- distinto, no redundante, porque ambos queries entran por case_id.
create index authorization_requests_case_live_idx
  on authorization_requests (case_id)
  where status in ('prepared', 'sent', 'viewed');

-- ===========================================================================
-- 6. Espejo SQL del hardening de idempotencia (sección 7) — columna nueva,
--    aditiva, nullable, sobre una tabla de 0085.
-- ===========================================================================
-- packages/application/src/commands/state.ts agrega `IdempotencyRecord.
-- inputHash` en este mismo pase (R0-E hardening sección 7: "hash de
-- input") para los 6 comandos obligatorios de esa sección. Esta columna es
-- el equivalente SQL — NO se edita 0085_transactional_trust.sql (migración
-- cerrada); se evoluciona hacia adelante con un ALTER TABLE aditivo, mismo
-- principio que cualquier columna nueva nullable sobre una tabla existente.
-- Ningún proceso real escribe esta tabla desde Postgres todavía (el motor
-- vive en memoria — ver la cabecera de 0085), así que esta columna queda
-- sin backfill: es la forma que R2 usará cuando idempotency_keys se
-- escriba desde una transacción real.

alter table idempotency_keys add column input_hash text;

comment on column idempotency_keys.input_hash is
  'sha256 hex del input canónico del comando — espejo de IdempotencyRecord.inputHash (packages/application/src/commands/state.ts, hashCommandInput()), agregado en R0-E hardening sección 7. Nullable a propósito: solo los 6 comandos obligatorios de esa sección lo completan hoy (CreateCaseFromIntake, ScheduleAppointment, ConfirmEvidenceUpload, FreezeQuoteVersion, PrepareAuthorizationRequest, RecordAuthorization) — el resto de comandos siguen replicando solo por (organization_id, command_name, key), un gap documentado en DATATEK_R0_E_FASE1_REPORT.md, no resuelto en este pase.';

-- ===========================================================================
-- 7. Grants de las views — mismo patrón que 0020–0087: solo SELECT, nunca
--    INSERT/UPDATE/DELETE (ninguna de estas views es escribible; todas son
--    `select` planos sin regla INSTEAD OF).
-- ===========================================================================

grant select on case_latest_status_event to authenticated;
grant select on case_active_assignment to authenticated;
grant select on inspection_latest_completed to authenticated;
grant select on quote_version_frozen_current to authenticated;
grant select on authorization_request_live to authenticated;
grant select on vehicle_access_grant_active to authenticated;
grant select on case_timeline_events to authenticated;
grant select on service_catalog_item_active_price to authenticated;

-- Ninguna view recibe grant para `anon` — mismo principio que cada tabla
-- base desde 0010: sin sesión autenticada, sin lectura.
