-- =====================================================================
-- DATATEK Flota · 107 · Ficha de la unidad, pilotos e inspección de salida — 24 nov 2026
--
-- Qué problema resuelve:
--   · El taller daba de alta pilotos y documentos solo desde el importador o la semilla: no había dónde verlos ni cambiarlos.
--     La ficha de la unidad (docs/nichos/4-flota.md, «Unidad: ficha, historial, salud, documentos») junta en una lectura los
--     datos, los pilotos, los documentos vigentes, el km reportado (con los rechazados), las inspecciones y las órdenes.
--   · Pilotos: reasignar a otra unidad, cambiar la licencia o darlo de baja (dt_flota_piloto_editar).
--   · Unidad de baja (vendida, chocada): sale de las listas y del panel sin borrar su historia; se puede reactivar.
--   · Inspección de salida (N-03): el piloto marca luces, llantas, frenos, aceite y tablero antes de salir, con el km. Si algo
--     está mal, queda como falla en el calendario del taller igual que dt_flota_reportar_falla.
--   · El piloto ve lo próximo de su unidad y cuándo vencen sus documentos (dt_flota_piloto_resumen).
--
-- Requiere: núcleo 01 a 06, Flota 100 a 106.
--
-- Qué NO hace a propósito:
--   · No borra pilotos ni unidades: se desactivan o se dan de baja, y la bitácora guarda quién y por qué.
--   · No guarda foto del tablero todavía: el bucket privado de fotos de Flota es otro paso.
--   · Una inspección no reemplaza la revisión del taller: no cambia la salud de las piezas.
-- =====================================================================

create table if not exists public.flota_inspecciones (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references public.unidades(id) on delete cascade,
  persona_id uuid references public.personas(id),
  items jsonb not null,
  todo_bien boolean not null,
  km integer check (km >= 0),
  nota text check (nota is null or length(nota) <= 300),
  evento_id uuid,
  en timestamptz not null default now()
);
create index if not exists flota_inspecciones_unidad on public.flota_inspecciones (unidad_id, en desc);

-- Lo que se revisa antes de salir (orden de la pantalla del piloto).
create or replace function public.dt_flota_items_inspeccion()
returns text[] language sql immutable as $$ select array['luces', 'llantas', 'frenos', 'aceite', 'tablero'] $$;

-- ¿Quien llama administra esta unidad (taller con ver_clientes/ver_ordenes o la empresa dueña)? El piloto no.
create or replace function public.dt_flota_gestiono_unidad(p_unidad uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.unidades u join public.flotas f on f.id = u.flota_id
    where u.id = p_unidad and (public.dt_tengo_capacidad(f.negocio_id, 'ver_clientes') or public.dt_tengo_capacidad(f.negocio_id, 'ver_ordenes')
      or f.cliente_id in (select public.dt_mis_clientes())))
$$;

-- ---------------------------------------------------------------------
-- Ficha de la unidad (taller o empresa)
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_ficha(p_unidad uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_neg uuid := public.dt_flota_negocio_de_unidad(p_unidad); v_taller boolean;
begin
  if v_neg is null then raise exception 'no_existe'; end if;
  if not public.dt_flota_gestiono_unidad(p_unidad) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  v_taller := public.dt_tengo_capacidad(v_neg, 'ver_ordenes') or public.dt_tengo_capacidad(v_neg, 'ver_clientes');
  select jsonb_build_object(
    'unidad', jsonb_build_object('id', u.id, 'placa', u.placa, 'marca', u.marca, 'linea', u.linea, 'anio', u.anio, 'vin', u.vin, 'km', u.km_actual,
       'km_reportado_en', u.km_reportado_en, 'estado', u.estado, 'flota_id', f.id, 'flota', f.nombre, 'baja_motivo', u.extras ->> 'baja_motivo'),
    'pilotos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'telefono', p.telefono, 'licencia_tipo', p.licencia_tipo,
        'licencia_vence', p.licencia_vence, 'ligado', p.persona_id is not null) order by p.nombre)
      from public.pilotos p where p.unidad_id = u.id and p.activo), '[]'::jsonb),
    -- Por tipo, el documento que vence último (el vigente); los reemplazados no se muestran.
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'tipo', d.tipo, 'numero', d.numero, 'vence', d.vence) order by d.vence)
      from public.documentos_unidad d where d.unidad_id = u.id
        and not exists (select 1 from public.documentos_unidad d2 where d2.unidad_id = d.unidad_id and d2.tipo = d.tipo and (d2.vence > d.vence or (d2.vence = d.vence and d2.subido_en > d.subido_en)))), '[]'::jsonb),
    'km', coalesce((select jsonb_agg(jsonb_build_object('km', k.km, 'en', k.en, 'rechazado', k.rechazado, 'quien', (select nombre from public.personas where id = k.persona_id)) order by k.en desc)
      from (select * from public.km_reportes where unidad_id = u.id order by en desc limit 8) k), '[]'::jsonb),
    'inspecciones', coalesce((select jsonb_agg(jsonb_build_object('en', i.en, 'todo_bien', i.todo_bien, 'items', i.items, 'km', i.km, 'nota', i.nota,
        'quien', (select nombre from public.personas where id = i.persona_id)) order by i.en desc)
      from (select * from public.flota_inspecciones where unidad_id = u.id order by en desc limit 8) i), '[]'::jsonb),
    'ordenes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'numero', o.numero, 'motivo', o.motivo, 'estado', o.estado, 'creada_en', o.creada_en,
        'total', public.dt_flota_total_aprobado(o.id)) order by o.creada_en desc)
      from public.ordenes o where o.unidad_id = u.id), '[]'::jsonb),
    'taller', v_taller
  ) into v
  from public.unidades u join public.flotas f on f.id = u.flota_id where u.id = p_unidad;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Pilotos
-- ---------------------------------------------------------------------
-- Reasignar, cambiar la licencia o dar de baja. p_unidad null = sin unidad asignada.
create or replace function public.dt_flota_piloto_editar(p_piloto uuid, p_unidad uuid, p_licencia_tipo text, p_licencia_vence date, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v public.pilotos; v_neg uuid;
begin
  select * into v from public.pilotos where id = p_piloto for update;
  if v.id is null then raise exception 'no_existe'; end if;
  select negocio_id into v_neg from public.flotas where id = v.flota_id;
  perform public.dt_exigir(v_neg, 'ver_clientes');
  if p_unidad is not null and not exists (select 1 from public.unidades where id = p_unidad and flota_id = v.flota_id and estado <> 'baja') then
    raise exception 'unidad_de_otra_flota';
  end if;
  update public.pilotos set unidad_id = p_unidad, licencia_tipo = nullif(trim(coalesce(p_licencia_tipo, '')), ''), licencia_vence = p_licencia_vence,
    activo = coalesce(p_activo, true) where id = p_piloto;
  perform public.dt_bitacora_anotar(v_neg, 'piloto', p_piloto, case when coalesce(p_activo, true) then 'piloto_editado' else 'piloto_de_baja' end,
    jsonb_build_object('unidad', p_unidad, 'antes', v.unidad_id));
end $$;

-- ---------------------------------------------------------------------
-- Baja y reactivación de una unidad
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_unidad_baja(p_unidad uuid, p_baja boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_neg uuid := public.dt_flota_negocio_de_unidad(p_unidad); v_estado text;
begin
  if v_neg is null then raise exception 'no_existe'; end if;
  perform public.dt_exigir(v_neg, 'ver_clientes');
  select estado into v_estado from public.unidades where id = p_unidad for update;
  if p_baja then
    if v_estado = 'baja' then raise exception 'ya_de_baja'; end if;
    if length(trim(coalesce(p_motivo, ''))) < 5 then raise exception 'falta_motivo'; end if;
    if exists (select 1 from public.ordenes where unidad_id = p_unidad and estado not in ('entregada', 'cancelada')) then raise exception 'tiene_orden_abierta'; end if;
    update public.unidades set estado = 'baja', extras = extras || jsonb_build_object('baja_motivo', trim(p_motivo)) where id = p_unidad;
    -- Sus pilotos quedan sin unidad (siguen activos para asignarlos a otra).
    update public.pilotos set unidad_id = null where unidad_id = p_unidad;
  else
    if v_estado <> 'baja' then raise exception 'no_esta_de_baja'; end if;
    update public.unidades set estado = 'operando', extras = extras - 'baja_motivo' where id = p_unidad;
  end if;
  perform public.dt_bitacora_anotar(v_neg, 'unidad', p_unidad, case when p_baja then 'unidad_de_baja' else 'unidad_reactivada' end,
    case when p_motivo is null then '{}'::jsonb else jsonb_build_object('motivo', trim(p_motivo)) end);
end $$;

-- ---------------------------------------------------------------------
-- Inspección de salida (piloto de la unidad o taller)
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_inspeccion(p_unidad uuid, p_items jsonb, p_km integer default null, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_neg uuid := public.dt_flota_negocio_de_unidad(p_unidad); v_es_piloto boolean; v_mal text[]; v_bien boolean; v_km text; v_ev uuid;
  v_cli uuid; v_placa text; v_id uuid; v_nombres jsonb := '{"luces":"luces","llantas":"llantas","frenos":"frenos","aceite":"aceite","tablero":"luz en el tablero"}';
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  if v_neg is null then raise exception 'no_existe'; end if;
  v_es_piloto := exists (select 1 from public.pilotos where unidad_id = p_unidad and persona_id = auth.uid() and activo);
  if not (v_es_piloto or public.dt_tengo_capacidad(v_neg, 'ver_ordenes')) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  if (select estado from public.unidades where id = p_unidad) = 'baja' then raise exception 'unidad_de_baja'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_items) k where not (k = any (public.dt_flota_items_inspeccion())))
     or exists (select 1 from unnest(public.dt_flota_items_inspeccion()) i where jsonb_typeof(p_items -> i) is distinct from 'boolean') then
    raise exception 'inspeccion_incompleta';
  end if;
  if (select count(*) from public.flota_inspecciones where unidad_id = p_unidad and persona_id = auth.uid() and en > now() - interval '12 hours') >= 4 then
    raise exception 'demasiadas_inspecciones';
  end if;
  select array_agg(i order by array_position(public.dt_flota_items_inspeccion(), i)) into v_mal
    from unnest(public.dt_flota_items_inspeccion()) i where (p_items ->> i)::boolean = false;
  v_bien := v_mal is null;
  if p_km is not null then v_km := public.dt_flota_reportar_km(p_unidad, p_km); end if;
  if not v_bien then
    select f.cliente_id, u.placa into v_cli, v_placa from public.unidades u join public.flotas f on f.id = u.flota_id where u.id = p_unidad;
    v_ev := public.dt_evento_crear(v_neg, 'falla', left(v_placa || ' · Inspección: revisar ' ||
      (select string_agg(v_nombres ->> m, ', ') from unnest(v_mal) m) || coalesce(' · ' || nullif(trim(coalesce(p_nota, '')), ''), ''), 200),
      'unidad', p_unidad, v_cli, now());
  end if;
  -- clock_timestamp: dos inspecciones en la misma transacción quedan en orden.
  insert into public.flota_inspecciones (unidad_id, persona_id, items, todo_bien, km, nota, evento_id, en)
  values (p_unidad, auth.uid(), p_items, v_bien, p_km, nullif(left(trim(coalesce(p_nota, '')), 300), ''), v_ev, clock_timestamp()) returning id into v_id;
  perform public.dt_bitacora_anotar(v_neg, 'unidad', p_unidad, case when v_bien then 'inspeccion_bien' else 'inspeccion_con_falla' end,
    jsonb_build_object('inspeccion', v_id, 'mal', to_jsonb(coalesce(v_mal, '{}'::text[])), 'evento', v_ev));
  return jsonb_build_object('todo_bien', v_bien, 'km', v_km, 'falla', v_ev);
end $$;

-- Lo que ve el piloto debajo de su unidad: lo próximo, los documentos vigentes, su licencia y si ya inspeccionó hoy.
create or replace function public.dt_flota_piloto_resumen(p_unidad uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s record; v_hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  if not public.dt_flota_puedo_ver_unidad(p_unidad) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  select * into s from public.dt_flota_salud(p_unidad);
  return jsonb_build_object(
    'proximo', s.proximo_nombre, 'proximo_detalle', s.proximo_detalle, 'proximo_tono', s.proximo_tono, 'conocidas', s.conocidas,
    'documentos', coalesce((select jsonb_agg(jsonb_build_object('tipo', d.tipo, 'vence', d.vence) order by d.vence) from public.documentos_unidad d
       where d.unidad_id = p_unidad and not exists (select 1 from public.documentos_unidad d2 where d2.unidad_id = d.unidad_id and d2.tipo = d.tipo and d2.vence > d.vence)), '[]'::jsonb),
    'licencia_vence', (select licencia_vence from public.pilotos where unidad_id = p_unidad and persona_id = auth.uid() and activo limit 1),
    'inspeccion_hoy', (select jsonb_build_object('en', i.en, 'todo_bien', i.todo_bien) from public.flota_inspecciones i
       where i.unidad_id = p_unidad and (i.en at time zone 'America/Guatemala')::date = v_hoy order by i.en desc limit 1)
  );
end $$;

-- ---------------------------------------------------------------------
alter table public.flota_inspecciones enable row level security;
revoke all on public.flota_inspecciones from anon;
revoke insert, update, delete, truncate on public.flota_inspecciones from authenticated;
drop policy if exists flota_inspecciones_ver on public.flota_inspecciones;
create policy flota_inspecciones_ver on public.flota_inspecciones for select to authenticated using (public.dt_flota_puedo_ver_unidad(unidad_id));

revoke execute on function public.dt_flota_items_inspeccion(), public.dt_flota_gestiono_unidad(uuid), public.dt_flota_ficha(uuid),
  public.dt_flota_piloto_editar(uuid, uuid, text, date, boolean), public.dt_flota_unidad_baja(uuid, boolean, text),
  public.dt_flota_inspeccion(uuid, jsonb, integer, text), public.dt_flota_piloto_resumen(uuid) from public, anon;
revoke execute on function public.dt_flota_gestiono_unidad(uuid) from authenticated;
grant execute on function public.dt_flota_items_inspeccion(), public.dt_flota_ficha(uuid), public.dt_flota_piloto_editar(uuid, uuid, text, date, boolean),
  public.dt_flota_unidad_baja(uuid, boolean, text), public.dt_flota_inspeccion(uuid, jsonb, integer, text), public.dt_flota_piloto_resumen(uuid) to authenticated;

-- Verificación (correr en Supabase después de aplicar; todo debe dar true)
-- select
--   to_regclass('public.flota_inspecciones') is not null as tabla,
--   (select relrowsecurity from pg_class where oid = 'public.flota_inspecciones'::regclass) as rls,
--   not has_table_privilege('authenticated', 'public.flota_inspecciones', 'insert') as solo_lectura,
--   to_regprocedure('public.dt_flota_ficha(uuid)') is not null as ficha,
--   not has_function_privilege('anon', 'public.dt_flota_inspeccion(uuid,jsonb,integer,text)', 'execute') as anon_cerrado,
--   not has_function_privilege('authenticated', 'public.dt_flota_gestiono_unidad(uuid)', 'execute') as interna_cerrada;
