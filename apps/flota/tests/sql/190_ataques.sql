-- Flota · ataques (docs/antes-de-construir/2-seguridad.md): comunes 1–10 y de Flota 23–26.
-- Cada «ok» es un ataque que NO funcionó. Lo corre apps/flota/tests/seguridad/ataque.mjs --estricto.
select prueba.crear_usuario('+50255550001') as plat \gset
select prueba.crear_usuario('+50255550002') as dueno \gset
select prueba.crear_usuario('+50255550003') as dueno2 \gset
select prueba.crear_usuario('+50255550011') as piloto \gset
select prueba.crear_usuario('+50255550099') as gerente \gset
select prueba.crear_usuario('+50255550066') as atacante \gset
insert into public.plataforma_admins values (:'plat');
select prueba.como(:'plat'); set role authenticated;
select public.dt_crear_negocio('Taller A', 'flota', '55550002') as neg \gset
select public.dt_crear_negocio('Taller B', 'flota', '55550003') as neg2 \gset
reset role;
select prueba.como(:'dueno'); set role authenticated;
select public.dt_crear_cliente(:'neg', 'Distribuidora', '55550099', null, 'empresa') as cli \gset
select public.dt_flota_crear(:'neg', :'cli', 'Flota', 0, 500) as flota \gset
select public.dt_flota_agregar_unidad(:'flota', 'P-123ABC', 'Toyota', 'Hilux', 2019, 100000) as unidad \gset
select public.dt_flota_agregar_unidad(:'flota', 'P-456DEF', 'Toyota', 'Hiace', 2018, 170000) as unidad_b \gset
select public.dt_flota_agregar_piloto(:'flota', 'Luis', '55550011', :'unidad', 'B', null);
select public.dt_flota_crear_orden(:'unidad', 'Servicio de 100,000 km') as orden \gset
select public.dt_flota_diagnostico(:'orden', 'Servicio normal');
select public.dt_flota_cotizar_linea(:'orden', 'Aceite y filtro', 'Cada 6 meses', 'necesario', 1, 900, 'engine_oil') as linea \gset
select public.dt_flota_cotizar_linea(:'orden', 'Frenos', 'Pastillas al 20 %', 'recomendado', 1, 1400, 'front_brakes') as linea2 \gset
select public.dt_flota_enviar_cotizacion(:'orden');
reset role;

-- 1. Leer, editar o borrar tablas directo, sin sesión o con una cuenta nueva
select prueba.anonimo(); set role anon;
select prueba.debe_fallar('select * from public.ordenes', '1a · anon no lee órdenes');
select prueba.debe_fallar('select * from public.clientes', '1b · anon no lee clientes');
select prueba.debe_fallar('select * from public.cobros', '1c · anon no lee cobros');
reset role;
select prueba.como(:'atacante'); set role authenticated;
select prueba.afirmar((select count(*) from public.ordenes) + (select count(*) from public.unidades) + (select count(*) from public.clientes) + (select count(*) from public.cobros) + (select count(*) from public.bitacora) = 0, '1d · una cuenta nueva no lee nada');
select prueba.debe_fallar($$ insert into public.ordenes (negocio_id, flota_id, unidad_id, numero, motivo) values ('$$ || :'neg' || $$', '$$ || :'flota' || $$', '$$ || :'unidad' || $$', 1, 'falsa') $$, '1e · no inserta órdenes');
select prueba.debe_fallar($$ update public.unidades set km_actual = 0 $$, '1f · no edita unidades');
select prueba.debe_fallar($$ delete from public.orden_lineas $$, '1g · no borra líneas');
-- 2 y 3. Registrarse como dueño o cambiarse de negocio, rol o plan
select prueba.debe_fallar($$ select public.dt_crear_negocio('Mío', 'flota', '55550066') $$, '2 · una cuenta no se crea un negocio');
select prueba.debe_fallar($$ insert into public.miembros values ('$$ || :'neg' || $$', '$$ || :'atacante' || $$', 'dueno') $$, '3a · no se mete como dueño');
select prueba.debe_fallar($$ update public.negocios set plan = 'completo', suscripcion = 'al_dia' $$, '3b · no se cambia el plan');
select prueba.debe_fallar($$ insert into public.plataforma_admins values ('$$ || :'atacante' || $$') $$, '3c · no se hace administrador de la plataforma');
-- 4. Cruces: funciones con ids de otro negocio
reset role;
select prueba.como(:'dueno2'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_orden('$$ || :'orden' || $$') $$, '4a · el dueño B no ve órdenes de A');
select prueba.debe_fallar($$ select public.dt_flota_cotizar_linea('$$ || :'orden' || $$', 'X', 'Explicación', 'necesario', 1, 1) $$, '4b · el dueño B no cotiza en A');
select prueba.debe_fallar($$ select public.dt_flota_mover_orden('$$ || :'orden' || $$', 'cancelada', 'sabotaje') $$, '4c · el dueño B no cancela órdenes de A');
select prueba.debe_fallar($$ select * from public.dt_flota_unidades('$$ || :'flota' || $$') $$, '4d · el dueño B no lista unidades de A');
select prueba.debe_fallar($$ select * from public.dt_cobros('$$ || :'neg' || $$') $$, '4e · el dueño B no ve cobros de A');
select prueba.debe_fallar($$ select public.dt_flota_crear('$$ || :'neg2' || $$', '$$ || :'cli' || $$', 'Robada', 0, 0) $$, '4f · el dueño B no arma flota con un cliente de A');
select prueba.debe_fallar($$ select public.dt_invitar('$$ || :'neg' || $$', 'miembro', null, 'jefe', '55550066') $$, '4g · el dueño B no invita personal a A');
select prueba.debe_fallar($$ select * from public.dt_eventos('$$ || :'neg' || $$', '2026-11-01', '2026-11-30') $$, '4h · el dueño B no ve el calendario de A');
reset role;
-- 5. Tomar la cuenta de otro con su teléfono sin confirmar
select prueba.crear_usuario('+50255550099', false, 'Impostor') as impostor \gset
select prueba.como(:'impostor'); set role authenticated;
select prueba.afirmar(public.dt_reclamar_clientes() = 0, '5a · un teléfono sin confirmar no reclama clientes');
select prueba.afirmar((select count(*) from public.dt_mis_negocios()) = 0, '5b · el impostor no ve el negocio del gerente');
reset role;
-- 6. Tocar la bitácora
select prueba.como(:'dueno'); set role authenticated;
select prueba.debe_fallar($$ update public.bitacora set accion = 'nada' $$, '6a · ni el dueño edita la bitácora');
select prueba.debe_fallar($$ select public.dt_bitacora_anotar('$$ || :'neg' || $$', 'orden', gen_random_uuid(), 'falsa') $$, '6b · ni el dueño escribe en la bitácora');
reset role;
-- 7. Aviso de pago repetido o sin pasar por la función firmada
select prueba.como(:'atacante'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_recurrente_aviso('svix', gen_random_uuid(), '{}') $$, '7 · nadie con sesión finge un aviso de Recurrente');
reset role;
-- 8. Llenar los topes de otro: repetir el aviso de cotización no gasta mensajes
select prueba.como(:'dueno');
select public.dt_recordatorio_encolar(:'neg', 'flota_cotizacion', '55550099', '{}', 'orden', :'orden');
select prueba.afirmar((select count(*) from public.recordatorios where objeto_id = :'orden' and estado = 'pendiente') = 1, '8 · el mismo aviso no se repite y no gasta el tope');
-- 9. Funciones abiertas a anon: Flota no abre ninguna; en la base compartida solo pueden estar las de la lista blanca común.
select prueba.afirmar(prueba.abiertas_a_anon() <@ prueba.lista_blanca_anon() and not exists (select 1 from unnest(prueba.abiertas_a_anon()) f where f like 'dt\_flota%'),
  '9 · ninguna función dt_ abierta a anon fuera de la lista blanca (y ninguna de Flota)');
select prueba.afirmar(not exists (
  select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('dt_bitacora_anotar', 'dt_cobro_crear', 'dt_cobro_registrar_pago', 'dt_recordatorio_encolar', 'dt_evento_crear', 'dt_flota_total_aprobado')
    and has_function_privilege('authenticated', p.oid, 'execute')),
  '9b · las funciones internas no están abiertas a cuentas con sesión');
select prueba.afirmar(not exists (
  select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  '9c · todas las tablas tienen RLS');
select prueba.afirmar(not exists (
  select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))),
  '9d · ninguna tabla se escribe directo');
-- 10. XSS: el texto se guarda tal cual (la pantalla escapa); no se ejecuta en la base
select prueba.como(:'dueno'); set role authenticated;
select public.dt_flota_cotizar_linea(:'orden', '<img src=x onerror=alert(1)>', 'texto <script>', 'recomendado', 1, 1) as xss \gset
select prueba.afirmar((select descripcion from public.orden_lineas where id = :'xss') = '<img src=x onerror=alert(1)>', '10 · el texto se guarda literal (React lo escapa al mostrar)');
reset role;

-- 23. El piloto no ve costos ni otras unidades
select prueba.como(:'piloto'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_orden('$$ || :'orden' || $$') $$, '23a · el piloto no ve la orden con precios');
select prueba.afirmar((select count(*) from public.unidades) = 1, '23b · el piloto ve solo su unidad');
select prueba.debe_fallar($$ select public.dt_flota_reportar_km('$$ || :'unidad_b' || $$', 999999) $$, '23c · el piloto no toca otra unidad');
reset role;
-- 24. La empresa no aprueba líneas de otra orden u otra flota (y el atacante tampoco)
select prueba.como(:'atacante'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_responder_linea('$$ || :'linea2' || $$', true) $$, '24 · un ajeno no aprueba líneas');
reset role;
-- 25. Aprobación automática arriba del tope: la línea de Q 1,400 con tope Q 500 queda pendiente
select prueba.afirmar((select respuesta from public.orden_lineas where id = :'linea2') = 'pendiente', '25a · sobre el tope no se aprueba sola');
select prueba.afirmar((select respuesta from public.orden_lineas where id = :'linea') = 'pendiente', '25b · Q 900 con tope Q 500 tampoco');
-- 26. Kilometraje hacia atrás
select prueba.como(:'piloto'); set role authenticated;
select prueba.afirmar(public.dt_flota_reportar_km(:'unidad', 10) = 'menor_al_anterior', '26 · km hacia atrás queda marcado y no pisa');
reset role;

-- 27. Ficha, pilotos e inspección (Flota 107): otro taller, un ajeno o el piloto no las usan para cruzar datos
select id as piloto_id from public.pilotos where telefono = '+50255550011' \gset
select prueba.como(:'piloto'); set role authenticated;
select public.dt_flota_reportar_falla(:'unidad', 'Luz del motor encendida') as evento_id \gset
reset role;
select prueba.como(:'dueno2'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_ficha('$$ || :'unidad' || $$') $$, '27a · el dueño B no lee la ficha de una unidad de A');
select prueba.debe_fallar($$ select public.dt_flota_unidad_baja('$$ || :'unidad_b' || $$', true, 'Sabotaje del otro taller') $$, '27b · el dueño B no da de baja unidades de A');
select prueba.debe_fallar($$ select public.dt_flota_piloto_editar('$$ || :'piloto_id' || $$', null, null, null, false) $$, '27c · el dueño B no edita pilotos de A');
reset role;
select prueba.como(:'atacante'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'unidad' || $$', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', 1, null) $$,
  '27d · un ajeno no firma inspecciones ni mueve el km');
select prueba.debe_fallar($$ select public.dt_flota_piloto_resumen('$$ || :'unidad' || $$') $$, '27e · un ajeno no lee el resumen del piloto');
reset role;
select prueba.como(:'piloto'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_ficha('$$ || :'unidad' || $$') $$, '27f · el piloto no lee la ficha con teléfonos y montos');
select prueba.debe_fallar($$ select public.dt_flota_inspeccion('$$ || :'unidad_b' || $$', '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null) $$,
  '27g · el piloto no inspecciona otra unidad');
reset role;
-- 28. Portal de la empresa y «Hoy» (Flota 108)
select prueba.como(:'dueno2'); set role authenticated;
select prueba.debe_fallar($$ select * from public.dt_flota_vencimientos('$$ || :'flota' || $$') $$, '28a · el dueño B no lee lo que vence en A');
select prueba.debe_fallar($$ select * from public.dt_flota_disponibilidad('$$ || :'flota' || $$') $$, '28b · ni la disponibilidad y el costo');
select prueba.debe_fallar($$ select * from public.dt_flota_avisos('$$ || :'neg' || $$') $$, '28c · ni los avisos de A');
select prueba.debe_fallar($$ select public.dt_flota_agendar_visita('$$ || :'flota' || $$', array['$$ || :'unidad' || $$']::uuid[], now() + interval '1 day', 'Visita falsa') $$,
  '28d · ni agenda visitas en A');
select prueba.debe_fallar($$ select public.dt_flota_orden_datos('$$ || :'orden' || $$', null, null, 'urgente') $$, '28e · ni cambia datos de órdenes de A');
select prueba.debe_fallar($$ select public.dt_flota_recordar_cotizacion('$$ || :'orden' || $$') $$, '28f · ni gasta mensajes de A recordando');
select prueba.debe_fallar($$ select * from public.dt_flota_tecnicos('$$ || :'neg' || $$') $$, '28g · ni lista el equipo de A');
reset role;
select prueba.como(:'atacante'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_solicitar_servicio('$$ || :'unidad' || $$', 'Servicio inventado') $$, '28h · un ajeno no pide servicios por la empresa');
select prueba.debe_fallar($$ select * from public.dt_flota_pilotos('$$ || :'flota' || $$') $$, '28i · un ajeno no lee los teléfonos de los pilotos');
reset role;
select prueba.como(:'gerente'); set role authenticated;
select prueba.debe_fallar($$ select public.dt_flota_atender_aviso('$$ || :'evento_id' || $$', true, null) $$, '28j · la empresa no abre órdenes por el taller');
reset role;
