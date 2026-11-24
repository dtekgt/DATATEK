-- Flota 108: la empresa ve lo que vence, sus pilotos y sus costos; pide servicio; el taller lo atiende desde «Hoy»;
-- visita por lote; datos de la orden y recordar la cotización.
select prueba.crear_usuario('+50255550001') as plat \gset
select prueba.crear_usuario('+50255550002') as dueno \gset
select prueba.crear_usuario('+50255550003') as tec \gset
select prueba.crear_usuario('+50255550005') as jefe \gset
select prueba.crear_usuario('+50255550099') as gerente \gset
select prueba.crear_usuario('+50255550097') as consulta \gset
select prueba.crear_usuario('+50255550098') as otra \gset
select prueba.crear_usuario('+50255550011', true, 'Luis Ramírez') as piloto \gset
select prueba.crear_usuario('+50255550006') as dueno2 \gset
insert into public.plataforma_admins values (:'plat');
select prueba.como(:'plat'); set role authenticated;
select public.dt_crear_negocio('Taller', 'flota', '55550002') as neg \gset
select public.dt_crear_negocio('Otro taller', 'flota', '55550006') as neg2 \gset
reset role;
insert into public.miembros (negocio_id, persona_id, rol) values (:'neg', :'tec', 'tecnico'), (:'neg', :'jefe', 'jefe');

select prueba.como(:'dueno'); set role authenticated;
select public.dt_crear_cliente(:'neg', 'Distribuidora', '55550099', null, 'empresa') as cli \gset
select public.dt_crear_cliente(:'neg', 'Transportes', '55550098', null, 'empresa') as cli2 \gset
select public.dt_flota_crear(:'neg', :'cli', 'Flota', 0, 0) as flota \gset
select public.dt_flota_crear(:'neg', :'cli2', 'Flota 2', 0, 0) as flota2 \gset
select public.dt_flota_agregar_unidad(:'flota', 'P-123ABC', 'Toyota', 'Hilux', 2019, 100000) as ua \gset
select public.dt_flota_agregar_unidad(:'flota', 'P-456DEF', 'Toyota', 'Hiace', 2018, 170000) as ub \gset
select public.dt_flota_agregar_unidad(:'flota2', 'P-999ZZZ', 'Nissan', 'Frontier', 2020, 50000) as uz \gset
select public.dt_flota_agregar_piloto(:'flota', 'Luis Ramírez', '55550011', :'ua', 'B', ((now() at time zone 'America/Guatemala')::date + 20)) as pa \gset
select public.dt_flota_documento(:'ub', 'seguro', 'S-1', ((now() at time zone 'America/Guatemala')::date + 10));
select public.dt_flota_documento(:'ua', 'tarjeta_circulacion', 'T-1', ((now() at time zone 'America/Guatemala')::date + 200));
select public.dt_flota_anotar_pieza(:'ua', 'engine_oil', ((now() at time zone 'America/Guatemala')::date - 200), 95000, 'cambiado');
select public.dt_flota_anotar_pieza(:'ua', 'front_brakes', ((now() at time zone 'America/Guatemala')::date - 10), 99000, 'atencion');
select public.dt_invitar(:'neg', 'cliente', :'cli', 'consulta', '55550097') as cod \gset
reset role;
select prueba.como(:'consulta'); set role authenticated;
select public.dt_aceptar_invitacion(:'cod');
reset role;
update public.unidades set creada_en = now() - interval '10 days';

-- Lo que vence (empresa)
select prueba.como(:'gerente'); set role authenticated;
select prueba.afirmar((select count(*) from public.dt_flota_vencimientos(:'flota') where tipo = 'servicio' and unidad_id = :'ua') = 2,
  'vence: el aceite vencido y los frenos en atención de P-123ABC');
select prueba.afirmar((select vence from public.dt_flota_vencimientos(:'flota') where que = 'Aceite y filtro') < (now() at time zone 'America/Guatemala')::date,
  'el aceite vencido por tiempo trae la fecha en que venció');
select prueba.afirmar((select estimada from public.dt_flota_vencimientos(:'flota') where que = 'Aceite y filtro'), 'y su fecha es estimada');
select prueba.afirmar(exists (select 1 from public.dt_flota_vencimientos(:'flota') where tipo = 'documento' and placa = 'P-456DEF'), 'el seguro de P-456DEF vence en 10 días');
select prueba.afirmar(not exists (select 1 from public.dt_flota_vencimientos(:'flota') where que = 'tarjeta_circulacion'), 'la tarjeta en 200 días no entra en 60');
select prueba.afirmar(exists (select 1 from public.dt_flota_vencimientos(:'flota', 365) where que = 'tarjeta_circulacion'), 'con un año sí');
select prueba.afirmar((select quien from public.dt_flota_vencimientos(:'flota') where tipo = 'licencia') = 'Luis Ramírez', 'la licencia del piloto también');
select prueba.afirmar((select count(*) from public.dt_flota_pilotos(:'flota')) = 1 and (select placa from public.dt_flota_pilotos(:'flota')) = 'P-123ABC', 'la empresa ve sus pilotos');
select prueba.debe_fallar($$ select * from public.dt_flota_vencimientos('$$ || :'flota2' || $$') $$, 'la empresa no ve lo que vence en otra flota');
select prueba.debe_fallar($$ select * from public.dt_flota_pilotos('$$ || :'flota2' || $$') $$, 'ni los pilotos de otra flota');
-- Disponibilidad y costo (ahora también para la empresa)
select prueba.afirmar((select count(*) from public.dt_flota_disponibilidad(:'flota')) = 2, 'la empresa ve la disponibilidad de su flota');
select prueba.afirmar((select costo from public.dt_flota_disponibilidad(:'flota') limit 1) = 0, 'el titular ve el costo');
select prueba.debe_fallar($$ select * from public.dt_flota_disponibilidad('$$ || :'flota2' || $$') $$, 'pero no la de otra empresa');
reset role;
select prueba.como(:'consulta'); set role authenticated;
select prueba.afirmar((select costo from public.dt_flota_disponibilidad(:'flota') limit 1) is null, 'quien solo mira no ve el costo');
select prueba.debe_fallar($$ select public.dt_flota_solicitar_servicio('$$ || :'ua' || $$', 'Servicio de aceite') $$, 'ni pide servicios');
reset role;
select prueba.como(:'piloto'); set role authenticated;
select prueba.debe_fallar($$ select * from public.dt_flota_disponibilidad('$$ || :'flota' || $$') $$, 'el piloto no ve disponibilidad ni costos');
select prueba.debe_fallar($$ select * from public.dt_flota_pilotos('$$ || :'flota' || $$') $$, 'ni la lista de pilotos con teléfonos');
reset role;

-- Pedir servicio y atenderlo desde «Hoy»
select prueba.como(:'gerente'); set role authenticated;
select public.dt_flota_solicitar_servicio(:'ua', 'Aceite y filtro') as sol \gset
select prueba.debe_fallar($$ select public.dt_flota_solicitar_servicio('$$ || :'ua' || $$', 'Otra vez lo mismo') $$, 'no se pide dos veces lo mismo mientras está abierto');
select prueba.debe_fallar($$ select public.dt_flota_solicitar_servicio('$$ || :'uz' || $$', 'Aceite') $$, 'no pide servicio para unidades de otra empresa');
select prueba.afirmar((select count(*) from public.dt_flota_mis_solicitudes(:'flota')) = 1, 'la empresa ve lo que pidió');
select prueba.debe_fallar($$ select * from public.dt_flota_avisos('$$ || :'neg' || $$') $$, 'la empresa no lee los avisos del taller');
reset role;
select prueba.como(:'piloto'); set role authenticated;
select public.dt_flota_reportar_falla(:'ua', 'Ruido al frenar') as falla \gset
reset role;
select prueba.como(:'tec'); set role authenticated;
select prueba.afirmar((select count(*) from public.dt_flota_avisos(:'neg')) = 2, 'el técnico ve la falla y la solicitud en Hoy');
select prueba.afirmar((select tipo from public.dt_flota_avisos(:'neg') limit 1) = 'falla', 'la falla va primero');
select prueba.afirmar((select quien from public.dt_flota_avisos(:'neg') where tipo = 'falla') = 'Luis Ramírez', 'y dice quién la reportó');
select public.dt_flota_atender_aviso(:'falla', true, null) as of \gset
select prueba.afirmar((select motivo from public.ordenes where id = :'of') = 'Ruido al frenar' and (select prioridad from public.ordenes where id = :'of') = 'urgente',
  'abrir la orden desde la falla: motivo sin la placa y urgente');
select prueba.afirmar((select estado from public.eventos where id = :'falla') = 'hecho', 'el aviso queda atendido');
select prueba.debe_fallar($$ select public.dt_flota_atender_aviso('$$ || :'falla' || $$', true, null) $$, 'un aviso atendido no abre otra orden');
select public.dt_flota_atender_aviso(:'sol', false, null);
select prueba.afirmar((select estado from public.eventos where id = :'sol') = 'cancelado', 'descartar la solicitud la saca de Hoy');
select prueba.afirmar((select count(*) from public.dt_flota_avisos(:'neg')) = 0, 'Hoy queda limpio');
reset role;
select prueba.como(:'dueno2'); set role authenticated;
select prueba.debe_fallar($$ select * from public.dt_flota_avisos('$$ || :'neg' || $$') $$, 'otro taller no lee los avisos');
select prueba.debe_fallar($$ select public.dt_flota_atender_aviso('$$ || :'sol' || $$', true, null) $$, 'ni los atiende');
reset role;

-- Visita por lote
select prueba.como(:'jefe'); set role authenticated;
select prueba.afirmar(public.dt_flota_agendar_visita(:'flota', array[:'ua', :'ub']::uuid[], now() + interval '2 days', 'Servicio en el patio') = 2,
  'el jefe agenda una visita con dos unidades');
select prueba.afirmar((select count(*) from public.eventos where tipo = 'servicio' and titulo like '% · Servicio en el patio') = 2, 'un evento por unidad');
select prueba.debe_fallar($$ select public.dt_flota_agendar_visita('$$ || :'flota' || $$', array['$$ || :'uz' || $$']::uuid[], now() + interval '1 day', 'Servicio') $$,
  'no mete unidades de otra flota');
select prueba.debe_fallar($$ select public.dt_flota_agendar_visita('$$ || :'flota' || $$', array[]::uuid[], now() + interval '1 day', 'Servicio') $$, 'sin unidades no agenda');
select (select id from public.eventos where tipo = 'servicio' and objeto_id = :'ub' limit 1) as visita \gset
select public.dt_flota_atender_aviso(:'visita', true, null) as ov \gset
select prueba.afirmar((select motivo from public.ordenes where id = :'ov') = 'Servicio en el patio' and (select prioridad from public.ordenes where id = :'ov') = 'normal',
  'la visita se abre como orden normal');
reset role;
select prueba.como(:'tec'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_agendar_visita('$$ || :'flota' || $$', array['$$ || :'ua' || $$']::uuid[], now() + interval '1 day', 'Servicio') $$,
  'el técnico (sin mover_calendario) no agenda visitas');
reset role;

-- Datos de la orden y recordar
select prueba.como(:'jefe'); set role authenticated;
select prueba.afirmar((select count(*) from public.dt_flota_tecnicos(:'neg')) = 3, 'técnicos: dueño, jefe y técnico registran trabajo');
select prueba.afirmar((select persona_id from public.dt_flota_tecnicos(:'neg') limit 1) = :'tec'::uuid, 'el técnico va primero');
select public.dt_flota_orden_datos(:'ov', :'tec', now() + interval '3 days', 'urgente');
select prueba.afirmar((select tecnico_id from public.ordenes where id = :'ov') = :'tec'::uuid and (select prioridad from public.ordenes where id = :'ov') = 'urgente',
  'el jefe asigna técnico, entrega y prioridad');
select prueba.afirmar((select datos ? 'tecnico' from public.bitacora where accion = 'datos_cambiados' limit 1), 'el cambio queda en la bitácora');
select prueba.debe_fallar($$ select public.dt_flota_orden_datos('$$ || :'ov' || $$', '$$ || :'dueno2' || $$', null, 'normal') $$, 'no asigna a alguien de otro taller');
select prueba.debe_fallar($$ select public.dt_flota_orden_datos('$$ || :'ov' || $$', null, null, 'altisima') $$, 'prioridad inválida');
select prueba.debe_fallar($$ select public.dt_flota_recordar_cotizacion('$$ || :'ov' || $$') $$, 'sin cotización enviada no hay qué recordar');
select public.dt_flota_diagnostico(:'ov', 'Servicio normal');
select public.dt_flota_cotizar_linea(:'ov', 'Aceite y filtro', 'Toca por tiempo', 'necesario', 1, 900, 'engine_oil');
select public.dt_flota_enviar_cotizacion(:'ov');
select prueba.afirmar((public.dt_flota_recordar_cotizacion(:'ov') ->> 'motivo') = 'repetido_en_4_horas', 'recordar dentro de 4 horas no gasta otro mensaje');
reset role;
update public.recordatorios set creado_en = now() - interval '5 hours';
select prueba.como(:'jefe'); set role authenticated;
select prueba.afirmar((public.dt_flota_recordar_cotizacion(:'ov') ->> 'enviado')::boolean, 'después de 4 horas sí recuerda');
reset role;
select prueba.como(:'tec'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_recordar_cotizacion('$$ || :'ov' || $$') $$, 'el técnico (sin cotizar) no recuerda');
reset role;
