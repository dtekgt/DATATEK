-- Flota 107: ficha de la unidad, pilotos, baja de unidades e inspección de salida.
select prueba.crear_usuario('+50255550001') as plat \gset
select prueba.crear_usuario('+50255550002') as dueno \gset
select prueba.crear_usuario('+50255550003') as tec \gset
select prueba.crear_usuario('+50255550099') as gerente \gset
select prueba.crear_usuario('+50255550011', true, 'Luis Ramírez') as piloto \gset
select prueba.crear_usuario('+50255550012', true, 'Mario López') as piloto2 \gset
select prueba.crear_usuario('+50255550066') as ajeno \gset
insert into public.plataforma_admins values (:'plat');
select prueba.como(:'plat'); set role authenticated;
select public.dt_crear_negocio('Taller', 'flota', '55550002') as neg \gset
reset role;
insert into public.miembros (negocio_id, persona_id, rol) values (:'neg', :'tec', 'tecnico');

select prueba.como(:'dueno'); set role authenticated;
select public.dt_crear_cliente(:'neg', 'Distribuidora', '55550099', null, 'empresa') as cli \gset
select public.dt_flota_crear(:'neg', :'cli', 'Flota', 0, 0) as flota \gset
select public.dt_flota_agregar_unidad(:'flota', 'P-123ABC', 'Toyota', 'Hilux', 2019, 100000) as ua \gset
select public.dt_flota_agregar_unidad(:'flota', 'P-456DEF', 'Toyota', 'Hiace', 2018, 170000) as ub \gset
select public.dt_flota_agregar_piloto(:'flota', 'Luis Ramírez', '55550011', :'ua', 'B', '2027-01-01') as pa \gset
select public.dt_flota_agregar_piloto(:'flota', 'Mario López', '55550012', :'ub', 'C', '2027-01-01') as pb \gset
select public.dt_flota_documento(:'ua', 'seguro', 'S-1', ((now() at time zone 'America/Guatemala')::date - 30));
select public.dt_flota_documento(:'ua', 'seguro', 'S-2', ((now() at time zone 'America/Guatemala')::date + 300));
select public.dt_flota_crear_orden(:'ub', 'Revisión de frenos') as ob \gset

-- Ficha
select public.dt_flota_ficha(:'ua') as ficha \gset
select prueba.afirmar((:'ficha'::jsonb -> 'unidad' ->> 'placa') = 'P-123ABC', 'la ficha trae la unidad');
select prueba.afirmar(jsonb_array_length(:'ficha'::jsonb -> 'pilotos') = 1, 'la ficha trae su piloto');
select prueba.afirmar(jsonb_array_length(:'ficha'::jsonb -> 'documentos') = 1 and (:'ficha'::jsonb -> 'documentos' -> 0 ->> 'numero') = 'S-2',
  'de cada documento muestra solo el vigente');
select prueba.afirmar((public.dt_flota_ficha(:'ub') -> 'ordenes' -> 0 ->> 'motivo') = 'Revisión de frenos', 'la ficha trae el historial de órdenes');
reset role;

select prueba.como(:'gerente'); set role authenticated;
select prueba.afirmar((public.dt_flota_ficha(:'ua') -> 'unidad' ->> 'placa') = 'P-123ABC', 'la empresa ve la ficha de su unidad');
select prueba.afirmar((public.dt_flota_ficha(:'ua') ->> 'taller')::boolean = false, 'y la ficha sabe que no es el taller');
select prueba.debe_fallar($$ select public.dt_flota_piloto_editar('$$ || :'pa' || $$', null, 'B', null, false) $$, 'la empresa no edita pilotos (lo hace el taller)');
reset role;

select prueba.como(:'piloto'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_ficha('$$ || :'ua' || $$') $$, 'el piloto no ve la ficha con teléfonos y órdenes');
reset role;
select prueba.como(:'ajeno'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_ficha('$$ || :'ua' || $$') $$, 'un ajeno no ve la ficha');
reset role;

-- Pilotos: reasignar, licencia y baja
select prueba.como(:'dueno'); set role authenticated;
select public.dt_flota_piloto_editar(:'pa', :'ub', 'C', '2028-02-01', true);
select prueba.afirmar((select unidad_id from public.pilotos where id = :'pa') = :'ub'::uuid and (select licencia_tipo from public.pilotos where id = :'pa') = 'C',
  'el taller reasigna al piloto y cambia su licencia');
select public.dt_flota_piloto_editar(:'pa', :'ua', 'C', '2028-02-01', true);
reset role;
select prueba.como(:'tec'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_piloto_editar('$$ || :'pa' || $$', null, 'B', null, false) $$, 'el técnico (sin ver_clientes) no edita pilotos');
reset role;

-- Baja de unidad
select prueba.como(:'dueno'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_unidad_baja('$$ || :'ub' || $$', true, 'Vendida a otra empresa') $$, 'no se da de baja con una orden abierta');
select prueba.debe_fallar($$ select public.dt_flota_unidad_baja('$$ || :'ua' || $$', true, 'x') $$, 'la baja pide motivo');
select public.dt_flota_mover_orden(:'ob', 'cancelada', 'La empresa la vendió');
select public.dt_flota_unidad_baja(:'ub', true, 'Vendida a otra empresa');
select prueba.afirmar((select estado from public.unidades where id = :'ub') = 'baja', 'la unidad queda de baja');
select prueba.afirmar((select unidad_id from public.pilotos where id = :'pb') is null, 'su piloto queda sin unidad');
select prueba.afirmar(not exists (select 1 from public.dt_flota_unidades(:'flota') where id = :'ub'), 'y sale de la lista de unidades');
select prueba.afirmar((select count(*) from public.bitacora where accion = 'unidad_de_baja') = 1, 'la baja queda en la bitácora');
select prueba.debe_fallar($$ select public.dt_flota_piloto_editar('$$ || :'pb' || $$', '$$ || :'ub' || $$', 'C', null, true) $$, 'no se asigna un piloto a una unidad de baja');
select public.dt_flota_unidad_baja(:'ub', false, null);
select prueba.afirmar((select estado from public.unidades where id = :'ub') = 'operando', 'la unidad se reactiva');
select public.dt_flota_piloto_editar(:'pb', :'ub', 'C', '2027-01-01', true);
reset role;

-- Inspección de salida
select prueba.como(:'piloto'); set role authenticated;
select public.dt_flota_inspeccion(:'ua', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', 100250, null) as r1 \gset
select prueba.afirmar((:'r1'::jsonb ->> 'todo_bien')::boolean and (:'r1'::jsonb ->> 'km') = 'ok' and (:'r1'::jsonb ->> 'falla') is null,
  'todo bien: guarda la inspección y el km, sin falla');
select prueba.afirmar((select km_actual from public.unidades where id = :'ua') = 100250, 'el km de la inspección actualiza la unidad');
select public.dt_flota_inspeccion(:'ua', '{"luces":true,"llantas":false,"frenos":false,"aceite":true,"tablero":true}', null, 'Pastilla suena') as r2 \gset
select prueba.afirmar((:'r2'::jsonb ->> 'falla') is not null, 'con algo mal crea la falla');
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'ua' || $$', '{"luces":true}', null, null) $$, 'la inspección incompleta no se guarda');
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'ua' || $$', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true,"motor":"x"}', null, null) $$,
  'no acepta claves de más');
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'ub' || $$', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null) $$,
  'el piloto no inspecciona otra unidad');
select public.dt_flota_piloto_resumen(:'ua') as res \gset
select prueba.afirmar((:'res'::jsonb -> 'inspeccion_hoy' ->> 'todo_bien')::boolean = false, 'el resumen dice que hoy inspeccionó (con falla)');
select prueba.afirmar((:'res'::jsonb -> 'documentos' -> 0 ->> 'tipo') = 'seguro' and jsonb_array_length(:'res'::jsonb -> 'documentos') = 1, 'y ve el seguro vigente');
select prueba.afirmar((:'res'::jsonb ->> 'licencia_vence') = '2028-02-01', 'y su licencia');
select prueba.debe_fallar($$ select public.dt_flota_piloto_resumen('$$ || :'ub' || $$') $$, 'el piloto no lee el resumen de otra unidad');
select public.dt_flota_inspeccion(:'ua', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null);
select public.dt_flota_inspeccion(:'ua', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null);
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'ua' || $$', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null) $$,
  'tope de inspecciones por turno');
select prueba.debe_fallar($$ insert into public.flota_inspecciones (unidad_id, items, todo_bien) values ('$$ || :'ua' || $$', '{}', true) $$, 'nadie inserta inspecciones directo');
reset role;
select prueba.afirmar((select titulo from public.eventos where id = (:'r2'::jsonb ->> 'falla')::uuid) = 'P-123ABC · Inspección: revisar llantas, frenos · Pastilla suena',
  'la falla dice qué revisar');
select prueba.afirmar((select count(*) from public.bitacora where accion like 'inspeccion%') = 4, 'cada inspección queda en la bitácora');

select prueba.como(:'gerente'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'ua' || $$', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null) $$,
  'la empresa no firma inspecciones por el piloto');
select prueba.afirmar(jsonb_array_length(public.dt_flota_ficha(:'ua') -> 'inspecciones') = 4, 'la empresa ve las inspecciones en la ficha');
reset role;
