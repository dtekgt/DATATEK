-- =====================================================================
-- DATATEK Flota · 108 · Portal de la empresa (vence, pilotos, costos, pedir servicio) y «Hoy» del taller — 24 nov 2026
--
-- Qué problema resuelve (docs/nichos/4-flota.md §7 y §8, docs/auditoria-usabilidad.md):
--   · La empresa no veía lo que vence (servicios, documentos y licencias), ni sus pilotos, ni el costo y los días parados por
--     unidad: esas son tres de las siete pantallas del portal. dt_flota_vencimientos y dt_flota_pilotos las sirven al taller y
--     a la empresa; dt_flota_disponibilidad (misma firma que en 104) ahora también la lee la empresa de su flota, y el costo lo
--     ve quien tiene ver_dinero o es titular/aprobador de la empresa (igual que su estado de cuenta).
--   · «Lo próximo» de una unidad no tenía botón: dt_flota_solicitar_servicio deja la solicitud en el calendario del taller.
--   · Las fallas del piloto y las solicitudes de la empresa solo se veían en el calendario. dt_flota_avisos las pone en «Hoy» y
--     dt_flota_atender_aviso abre la orden desde ahí (o la descarta) en un toque. Sirve también para abrir la orden de una
--     visita agendada.
--   · Visita por lote: dt_flota_agendar_visita agenda una visita al patio con varias unidades (un evento por unidad, el mismo día
--     y franja), que el calendario abre como órdenes cuando llega el mecánico.
--   · Orden de trabajo: técnico, entrega prometida y prioridad se podían poner solo al crearla (dt_flota_orden_datos), y
--     «Recordar a la empresa» por WhatsApp respetando las 4 horas del núcleo (dt_flota_recordar_cotizacion).
--
-- Requiere: núcleo 01 a 07, Flota 100 a 107.
--
-- Qué NO hace a propósito:
--   · No manda WhatsApp al agendar la visita: falta una plantilla aprobada para eso (docs/antes-de-construir/8).
--   · Solicitar servicio no crea la orden: el taller decide si la abre (y cuándo); la empresa ve la orden cuando se abre.
--   · Quien solo mira en la empresa (rol «consulta») no pide servicios ni ve costos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Disponibilidad y costo: también para la empresa de la flota (misma firma y cálculo que en 104)
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_disponibilidad(p_flota uuid, p_mes date default null)
returns table (unidad_id uuid, placa text, descripcion text, dias numeric, dias_taller numeric, disponibilidad integer, costo numeric, ordenes bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_neg uuid; v_cli uuid; v_dinero boolean; v_mes date := date_trunc('month', coalesce(p_mes, (now() at time zone 'America/Guatemala')::date))::date;
  v_desde timestamptz; v_hasta timestamptz;
begin
  select negocio_id, cliente_id into v_neg, v_cli from public.flotas where id = p_flota;
  if v_neg is null then raise exception 'no_existe'; end if;
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  if not (public.dt_tengo_capacidad(v_neg, 'ver_panel') or v_cli in (select public.dt_mis_clientes())) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  v_dinero := public.dt_tengo_capacidad(v_neg, 'ver_dinero') or v_cli in (select public.dt_mis_clientes_titulares());
  v_desde := v_mes::timestamp at time zone 'America/Guatemala';
  v_hasta := least((v_mes + interval '1 month')::timestamp at time zone 'America/Guatemala', now());
  if v_hasta <= v_desde then return; end if;
  return query
  select u.id, u.placa, concat_ws(' ', u.marca, u.linea, u.anio::text),
         round(extract(epoch from v_hasta - greatest(v_desde, u.creada_en)) / 86400.0, 1),
         round(extract(epoch from public.dt_flota_tiempo_taller(u.id, greatest(v_desde, u.creada_en), v_hasta)) / 86400.0, 1),
         coalesce(greatest(0, round(100 * (1 - extract(epoch from public.dt_flota_tiempo_taller(u.id, greatest(v_desde, u.creada_en), v_hasta))
                                 / nullif(extract(epoch from v_hasta - greatest(v_desde, u.creada_en)), 0)))), 100)::int,
         case when v_dinero then coalesce((select sum(c.monto) from public.cobros c join public.ordenes o on o.id = c.origen_id
             where c.origen = 'orden' and o.unidad_id = u.id and c.estado <> 'anulado' and c.creado_en >= v_desde and c.creado_en < v_hasta), 0) end,
         (select count(*) from public.ordenes o where o.unidad_id = u.id and o.creada_en < v_hasta
             and o.estado <> 'cancelada' and (o.estado <> 'entregada' or o.creada_en >= v_desde
               or exists (select 1 from public.bitacora b where b.negocio_id = o.negocio_id and b.objeto = 'orden' and b.objeto_id = o.id and b.accion = 'entregada' and b.en >= v_desde)))
  from public.unidades u
  where u.flota_id = p_flota and u.estado <> 'baja' and u.creada_en < v_hasta
  order by 6, u.placa;
end $$;

-- ¿Quien llama ve esta flota (taller o empresa)?
create or replace function public.dt_flota_veo_flota(p_flota uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.flotas f where f.id = p_flota and (public.dt_tengo_capacidad(f.negocio_id, 'ver_clientes')
    or public.dt_tengo_capacidad(f.negocio_id, 'ver_ordenes') or f.cliente_id in (select public.dt_mis_clientes())))
$$;

-- ---------------------------------------------------------------------
-- Lo que vence: servicios (fecha estimada por meses), documentos y licencias
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_vencimientos(p_flota uuid, p_dias integer default 60)
returns table (tipo text, que text, unidad_id uuid, placa text, quien text, vence date, estimada boolean, detalle text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_hoy date := (now() at time zone 'America/Guatemala')::date; v_hasta date;
begin
  if not public.dt_flota_veo_flota(p_flota) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  v_hasta := v_hoy + least(greatest(coalesce(p_dias, 60), 1), 366);
  return query
  select * from (
    select 'servicio'::text, p.nombre, u.id, u.placa, null::text,
      case when c.modo = 'intervalo' then (case when p.tono = 'vencido' then least(v_hoy, (p.realizado_en + make_interval(months => c.meses))::date)
                                              else (p.realizado_en + make_interval(months => c.meses))::date end)
           else p.realizado_en end,
      c.modo = 'intervalo', p.detalle
    from public.unidades u cross join lateral public.dt_flota_salud_piezas(u.id) p join public.flota_componentes c on c.clave = p.componente
    where u.flota_id = p_flota and u.estado <> 'baja' and p.tono in ('vencido', 'proximo')
    union all
    select 'documento', d.tipo, u.id, u.placa, null, d.vence, false, d.numero
    from public.documentos_unidad d join public.unidades u on u.id = d.unidad_id
    where u.flota_id = p_flota and u.estado <> 'baja' and d.vence <= v_hasta
      and not exists (select 1 from public.documentos_unidad d2 where d2.unidad_id = d.unidad_id and d2.tipo = d.tipo and d2.vence > d.vence)
    union all
    select 'licencia', coalesce('Licencia ' || pi.licencia_tipo, 'Licencia'), pi.unidad_id, u.placa, pi.nombre, pi.licencia_vence, false, null
    from public.pilotos pi left join public.unidades u on u.id = pi.unidad_id
    where pi.flota_id = p_flota and pi.activo and pi.licencia_vence <= v_hasta
  ) x order by 6 nulls last, 4;
end $$;

-- Pilotos de una flota con su licencia y la unidad asignada.
create or replace function public.dt_flota_pilotos(p_flota uuid)
returns table (id uuid, nombre text, telefono text, unidad_id uuid, placa text, licencia_tipo text, licencia_vence date, ligado boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.dt_flota_veo_flota(p_flota) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  return query select p.id, p.nombre, p.telefono, p.unidad_id, u.placa, p.licencia_tipo, p.licencia_vence, p.persona_id is not null
    from public.pilotos p left join public.unidades u on u.id = p.unidad_id
    where p.flota_id = p_flota and p.activo order by p.nombre;
end $$;

-- ---------------------------------------------------------------------
-- La empresa pide un servicio desde el Garage de la unidad
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_solicitar_servicio(p_unidad uuid, p_que text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_neg uuid; v_cli uuid; v_placa text; v_estado text; v_ev uuid;
begin
  if auth.uid() is null then raise exception 'sin_sesion' using errcode = '42501'; end if;
  select f.negocio_id, f.cliente_id, u.placa, u.estado into v_neg, v_cli, v_placa, v_estado from public.unidades u join public.flotas f on f.id = u.flota_id where u.id = p_unidad;
  if v_neg is null then raise exception 'no_existe'; end if;
  if v_cli not in (select public.dt_mis_clientes_titulares()) then raise exception 'sin_permiso: solo quien aprueba en la empresa' using errcode = '42501'; end if;
  if v_estado = 'baja' then raise exception 'unidad_de_baja'; end if;
  if length(trim(coalesce(p_que, ''))) < 3 then raise exception 'falta_detalle'; end if;
  if exists (select 1 from public.eventos where objeto = 'unidad' and objeto_id = p_unidad and tipo = 'solicitud' and estado = 'programado') then
    raise exception 'ya_solicitado';
  end if;
  v_ev := public.dt_evento_crear(v_neg, 'solicitud', left(v_placa || ' · ' || trim(p_que), 200), 'unidad', p_unidad, v_cli, now());
  perform public.dt_bitacora_anotar(v_neg, 'unidad', p_unidad, 'servicio_solicitado', jsonb_build_object('evento', v_ev));
  return v_ev;
end $$;

-- Las solicitudes abiertas de la flota (para que la empresa vea lo que ya pidió).
create or replace function public.dt_flota_mis_solicitudes(p_flota uuid)
returns table (evento_id uuid, unidad_id uuid, titulo text, en timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.dt_flota_veo_flota(p_flota) then raise exception 'sin_permiso' using errcode = '42501'; end if;
  return query select e.id, e.objeto_id, e.titulo, e.creado_en from public.eventos e join public.unidades u on u.id = e.objeto_id
    where e.objeto = 'unidad' and u.flota_id = p_flota and e.tipo = 'solicitud' and e.estado = 'programado' order by e.creado_en desc;
end $$;

-- ---------------------------------------------------------------------
-- «Hoy» del taller: fallas y solicitudes sin atender, y abrir la orden desde ahí
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_avisos(p_negocio uuid)
returns table (evento_id uuid, tipo text, titulo text, unidad_id uuid, placa text, flota text, en timestamptz, quien text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.dt_exigir(p_negocio, 'ver_ordenes');
  return query select e.id, e.tipo, e.titulo, u.id, u.placa, f.nombre, e.creado_en, (select nombre from public.personas where id = e.creado_por)
    from public.eventos e join public.unidades u on u.id = e.objeto_id join public.flotas f on f.id = u.flota_id
    where e.negocio_id = p_negocio and e.objeto = 'unidad' and e.tipo in ('falla', 'solicitud') and e.estado = 'programado'
      and e.creado_en > now() - interval '30 days' and f.negocio_id = p_negocio
    order by (e.tipo = 'falla') desc, e.creado_en desc;
end $$;

-- Abrir la orden (p_abrir) o descartar el aviso. También abre la orden de un servicio agendado (visita).
create or replace function public.dt_flota_atender_aviso(p_evento uuid, p_abrir boolean, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.eventos; v_orden uuid; v_placa text; v_motivo text;
begin
  select * into v from public.eventos where id = p_evento for update;
  if v.id is null or v.objeto is distinct from 'unidad' or v.tipo not in ('falla', 'solicitud', 'servicio') then raise exception 'no_existe'; end if;
  if public.dt_flota_negocio_de_unidad(v.objeto_id) is distinct from v.negocio_id then raise exception 'no_existe'; end if;
  perform public.dt_exigir(v.negocio_id, 'ver_ordenes');
  if v.estado <> 'programado' then raise exception 'aviso_ya_atendido'; end if;
  if p_abrir then
    select placa into v_placa from public.unidades where id = v.objeto_id;
    v_motivo := coalesce(nullif(trim(coalesce(p_motivo, '')), ''), 
      case when left(v.titulo, length(v_placa) + 3) = v_placa || ' · ' then substr(v.titulo, length(v_placa) + 4) else v.titulo end);
    if length(trim(v_motivo)) < 3 then v_motivo := 'Revisión pedida'; end if;
    v_orden := public.dt_flota_crear_orden(v.objeto_id, left(v_motivo, 300), case when v.tipo = 'falla' then 'urgente' else 'normal' end, null);
    update public.eventos set estado = 'hecho', realizada_en = now() where id = p_evento;
  else
    update public.eventos set estado = 'cancelado' where id = p_evento;
  end if;
  perform public.dt_bitacora_anotar(v.negocio_id, 'evento', p_evento, case when p_abrir then 'aviso_con_orden' else 'aviso_descartado' end,
    jsonb_build_object('orden', v_orden, 'tipo', v.tipo));
  return v_orden;
end $$;

-- ---------------------------------------------------------------------
-- Visita al patio con varias unidades
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_agendar_visita(p_flota uuid, p_unidades uuid[], p_cuando timestamptz, p_motivo text)
returns integer language plpgsql security definer set search_path = public as $$
declare f public.flotas; r record; v_n integer := 0;
begin
  select * into f from public.flotas where id = p_flota;
  if f.id is null then raise exception 'no_existe'; end if;
  perform public.dt_exigir(f.negocio_id, 'mover_calendario');
  if coalesce(array_length(p_unidades, 1), 0) = 0 then raise exception 'elegi_unidades'; end if;
  if array_length(p_unidades, 1) > 60 then raise exception 'demasiadas_unidades'; end if;
  if exists (select 1 from unnest(p_unidades) x where not exists (select 1 from public.unidades u where u.id = x and u.flota_id = p_flota and u.estado <> 'baja')) then
    raise exception 'unidad_de_otra_flota';
  end if;
  if p_cuando is null or p_cuando < now() - interval '1 day' then raise exception 'fecha_pasada'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'falta_motivo'; end if;
  for r in select distinct u.id, u.placa from public.unidades u where u.id = any (p_unidades) order by u.placa loop
    perform public.dt_evento_crear(f.negocio_id, 'servicio', left(r.placa || ' · ' || trim(p_motivo), 200), 'unidad', r.id, f.cliente_id, p_cuando);
    v_n := v_n + 1;
  end loop;
  perform public.dt_bitacora_anotar(f.negocio_id, 'flota', p_flota, 'visita_agendada', jsonb_build_object('unidades', v_n, 'cuando', p_cuando, 'motivo', trim(p_motivo)));
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Orden: técnico, entrega y prioridad; recordar a la empresa
-- ---------------------------------------------------------------------
create or replace function public.dt_flota_tecnicos(p_negocio uuid)
returns table (persona_id uuid, nombre text, rol text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform public.dt_exigir(p_negocio, 'ver_ordenes');
  return query select m.persona_id, coalesce(p.nombre, 'Sin nombre'), m.rol
    from public.miembros m join public.negocios n on n.id = m.negocio_id left join public.personas p on p.id = m.persona_id
    where m.negocio_id = p_negocio and m.activo and 'registrar_trabajo' = any (public.dt_capacidades_rol(n.producto, m.rol))
    order by (m.rol = 'tecnico') desc, p.nombre;
end $$;

create or replace function public.dt_flota_orden_datos(p_orden uuid, p_tecnico uuid, p_entrega timestamptz, p_prioridad text)
returns void language plpgsql security definer set search_path = public as $$
declare v public.ordenes;
begin
  select * into v from public.ordenes where id = p_orden for update;
  if v.id is null then raise exception 'no_existe'; end if;
  perform public.dt_exigir(v.negocio_id, 'ver_ordenes');
  if v.estado in ('entregada', 'cancelada') then raise exception 'orden_cerrada'; end if;
  if p_prioridad not in ('normal', 'urgente') then raise exception 'prioridad_invalida'; end if;
  if p_tecnico is not null and not exists (select 1 from public.miembros where negocio_id = v.negocio_id and persona_id = p_tecnico and activo) then
    raise exception 'tecnico_de_otro_negocio';
  end if;
  update public.ordenes set tecnico_id = p_tecnico, entrega_prometida = p_entrega, prioridad = p_prioridad where id = p_orden;
  perform public.dt_bitacora_anotar(v.negocio_id, 'orden', p_orden, 'datos_cambiados', jsonb_strip_nulls(jsonb_build_object(
    'tecnico', case when p_tecnico is distinct from v.tecnico_id then p_tecnico end,
    'entrega', case when p_entrega is distinct from v.entrega_prometida then p_entrega end,
    'prioridad', case when p_prioridad is distinct from v.prioridad then p_prioridad end)));
end $$;

create or replace function public.dt_flota_recordar_cotizacion(p_orden uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v public.ordenes; v_pend integer; v_monto numeric; v_tel text; v_placa text; v_id uuid; r public.recordatorios;
begin
  select * into v from public.ordenes where id = p_orden;
  if v.id is null then raise exception 'no_existe'; end if;
  perform public.dt_exigir(v.negocio_id, 'cotizar');
  select count(*), coalesce(sum(round(cantidad * precio, 2)), 0) into v_pend, v_monto from public.orden_lineas where orden_id = p_orden and respuesta = 'pendiente';
  if v.estado <> 'espera_cliente' or v_pend = 0 then raise exception 'nada_que_recordar'; end if;
  select c.telefono, u.placa into v_tel, v_placa from public.flotas f join public.clientes c on c.id = f.cliente_id join public.unidades u on u.id = v.unidad_id where f.id = v.flota_id;
  if v_tel is null then raise exception 'empresa_sin_telefono'; end if;
  v_id := public.dt_recordatorio_encolar(v.negocio_id, 'flota_cotizacion', v_tel,
    jsonb_build_object('placa', v_placa, 'n', v_pend, 'monto', 'Q ' || to_char(v_monto, 'FM999,999,990.00')), 'orden', p_orden);
  select * into r from public.recordatorios where id = v_id;
  if r.estado = 'pendiente' then perform public.dt_bitacora_anotar(v.negocio_id, 'orden', p_orden, 'cotizacion_recordada', '{}'); end if;
  return jsonb_build_object('enviado', r.estado = 'pendiente', 'motivo', r.motivo);
end $$;

-- ---------------------------------------------------------------------
revoke execute on function public.dt_flota_veo_flota(uuid), public.dt_flota_vencimientos(uuid, integer), public.dt_flota_pilotos(uuid),
  public.dt_flota_solicitar_servicio(uuid, text), public.dt_flota_mis_solicitudes(uuid), public.dt_flota_avisos(uuid),
  public.dt_flota_atender_aviso(uuid, boolean, text), public.dt_flota_agendar_visita(uuid, uuid[], timestamptz, text),
  public.dt_flota_tecnicos(uuid), public.dt_flota_orden_datos(uuid, uuid, timestamptz, text), public.dt_flota_recordar_cotizacion(uuid),
  public.dt_flota_disponibilidad(uuid, date) from public, anon;
revoke execute on function public.dt_flota_veo_flota(uuid) from authenticated;
grant execute on function public.dt_flota_vencimientos(uuid, integer), public.dt_flota_pilotos(uuid), public.dt_flota_solicitar_servicio(uuid, text),
  public.dt_flota_mis_solicitudes(uuid), public.dt_flota_avisos(uuid), public.dt_flota_atender_aviso(uuid, boolean, text),
  public.dt_flota_agendar_visita(uuid, uuid[], timestamptz, text), public.dt_flota_tecnicos(uuid), public.dt_flota_orden_datos(uuid, uuid, timestamptz, text),
  public.dt_flota_recordar_cotizacion(uuid), public.dt_flota_disponibilidad(uuid, date) to authenticated;

-- Verificación (correr en Supabase después de aplicar; todo debe dar true)
-- select
--   to_regprocedure('public.dt_flota_vencimientos(uuid,integer)') is not null as vencimientos,
--   to_regprocedure('public.dt_flota_atender_aviso(uuid,boolean,text)') is not null as atender,
--   to_regprocedure('public.dt_flota_agendar_visita(uuid,uuid[],timestamptz,text)') is not null as visita,
--   position('dt_mis_clientes' in pg_get_functiondef('public.dt_flota_disponibilidad(uuid,date)'::regprocedure)) > 0 as disponibilidad_empresa,
--   not has_function_privilege('anon', 'public.dt_flota_solicitar_servicio(uuid,text)', 'execute') as anon_cerrado,
--   not has_function_privilege('authenticated', 'public.dt_flota_veo_flota(uuid)', 'execute') as interna_cerrada;
