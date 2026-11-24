-- Datos de las maquetas (Taller D-TEK Flotas, Distribuidora Ejemplo) para recorrer las pantallas. Solo arnés local.
do $$
declare
  plat uuid; dueno uuid; tec uuid; gerente uuid; piloto uuid; mario uuid;
  neg uuid; cli uuid; cli2 uuid; fl uuid; fl2 uuid;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid; u6 uuid; u7 uuid;
  o1 uuid; o2 uuid; o3 uuid; l uuid;
  hoy date := (now() at time zone 'America/Guatemala')::date;
begin
  plat := prueba.crear_usuario('+50255550001', true, 'Plataforma');
  dueno := prueba.crear_usuario('+50255550002', true, 'Carlos Méndez');
  tec := prueba.crear_usuario('+50255550003', true, 'Juan Pérez');
  gerente := prueba.crear_usuario('+50255550099', true, 'Gerente Distribuidora');
  piloto := prueba.crear_usuario('+50255550011', true, 'Luis Ramírez');
  mario := prueba.crear_usuario('+50255550012', true, 'Mario López');
  insert into public.plataforma_admins values (plat);
  perform prueba.como(plat);
  neg := public.dt_crear_negocio('Taller D-TEK Flotas', 'flota', '55550002');
  insert into public.miembros (negocio_id, persona_id, rol) values (neg, tec, 'tecnico');
  insert into public.pagos_cuenta (negocio_id, recurrente_conectado, fel_activa) values (neg, true, true);

  perform prueba.como(dueno);
  cli := public.dt_crear_cliente(neg, 'Distribuidora Ejemplo', '55550099', '1234567-8', 'empresa');
  cli2 := public.dt_crear_cliente(neg, 'Transportes Ejemplo', '55550098', null, 'empresa');
  fl := public.dt_flota_crear(neg, cli, 'Flota Distribuidora Ejemplo', 15, 1000);
  fl2 := public.dt_flota_crear(neg, cli2, 'Flota Transportes Ejemplo', 0, 0);
  u1 := public.dt_flota_agregar_unidad(fl, 'P-123ABC', 'Toyota', 'Hilux', 2019, 148200);
  u2 := public.dt_flota_agregar_unidad(fl, 'C-789GHI', 'Isuzu', 'NPR', 2017, 212000);
  u3 := public.dt_flota_agregar_unidad(fl, 'C-987PQR', 'Hino', '300', 2016, 197800);
  u4 := public.dt_flota_agregar_unidad(fl, 'P-321JKL', 'Toyota', 'Hilux', 2021, 61300);
  u5 := public.dt_flota_agregar_unidad(fl, 'P-147STU', 'Toyota', 'Hilux', 2022, 38900);
  u6 := public.dt_flota_agregar_unidad(fl, 'P-456DEF', 'Toyota', 'Hiace', 2018, 176000);
  u7 := public.dt_flota_agregar_unidad(fl2, 'P-999ZZZ', 'Nissan', 'Frontier', 2020, 50000);
  perform public.dt_flota_agregar_piloto(fl, 'Luis Ramírez', '55550011', u1, 'B', '2028-01-01');
  perform public.dt_flota_agregar_piloto(fl, 'Mario López', '55550012', u2, 'C', '2027-05-01');
  perform public.dt_flota_agregar_piloto(fl, 'Ana Gómez', '55550013', u4, 'B', hoy + 24);
  perform public.dt_flota_documento(u4, 'seguro', 'POL-321', hoy + 9);
  perform public.dt_flota_documento(u1, 'seguro', 'POL-123', hoy + 49);
  perform public.dt_flota_documento(u6, 'tarjeta_circulacion', 'TC-456', hoy + 52);
  -- Historia de piezas
  perform public.dt_flota_anotar_pieza(u1, 'engine_oil', hoy - 12, 147000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u1, 'engine_air_filter', hoy - 300, 140000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u1, 'cabin_air_filter', hoy - 12, 147000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u1, 'front_brakes', hoy - 12, 147000, 'atencion');
  perform public.dt_flota_anotar_pieza(u1, 'tires', hoy - 12, 147000, 'bien');
  perform public.dt_flota_anotar_pieza(u1, 'battery', hoy - 12, 147000, 'bien');
  perform public.dt_flota_anotar_pieza(u3, 'engine_oil', hoy - 200, 190000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u3, 'suspension', hoy - 40, 195000, 'atencion');
  perform public.dt_flota_anotar_pieza(u4, 'engine_oil', hoy - 30, 60000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u4, 'tires', hoy - 30, 60000, 'bien');
  perform public.dt_flota_anotar_pieza(u5, 'engine_oil', hoy - 20, 38000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u6, 'engine_oil', hoy - 150, 172000, 'cambiado');
  perform public.dt_flota_anotar_pieza(u6, 'front_brakes', hoy - 60, 172000, 'bien');

  -- Orden cerrada y cobrada parcialmente (P-123ABC, servicio)
  o3 := public.dt_flota_crear_orden(u1, 'Servicio de 145,000 km', 'normal', null);
  perform public.dt_flota_recepcion(o3, 145100, 6, null, '{}', 'Luis Ramírez');
  perform public.dt_flota_diagnostico(o3, 'Servicio normal, frenos al 30 %');
  l := public.dt_flota_cotizar_linea(o3, 'Aceite y filtros', 'Servicio de 145,000 km', 'necesario', 1, 1150, 'engine_oil');
  perform public.dt_flota_enviar_cotizacion(o3);
  perform prueba.como(gerente);
  perform public.dt_flota_responder_linea(l, true);
  perform prueba.como(dueno);
  perform public.dt_flota_mover_orden(o3, 'en_trabajo');
  perform public.dt_flota_marcar_linea(l, true);
  perform public.dt_flota_mover_orden(o3, 'control_calidad');
  perform public.dt_flota_mover_orden(o3, 'lista');
  perform public.dt_flota_mover_orden(o3, 'entregada');

  -- Orden de la maqueta: C-789GHI, caja de cambios, esperando a la empresa
  o1 := public.dt_flota_crear_orden(u2, 'La caja no entra en tercera', 'urgente', ((hoy + 1)::timestamp + time '16:00') at time zone 'America/Guatemala');
  perform public.dt_flota_recepcion(o1, 212400, 5, 'Golpe en la puerta izquierda', '{}', 'Mario López');
  perform public.dt_flota_diagnostico(o1, 'Embrague patina en tercera y cuarta. Collarín con ruido. Soporte de motor derecho agrietado.');
  perform public.dt_flota_cotizar_linea(o1, 'Kit de embrague y collarín', 'Desgastado: es lo que impide meter tercera', 'necesario', 1, 4800, null);
  perform public.dt_flota_cotizar_linea(o1, 'Aceite de caja', 'Se cambia con el embrague, ahorra mano de obra', 'recomendado', 1, 650, 'transmission_fluid');
  perform public.dt_flota_cotizar_linea(o1, 'Soporte de motor', 'Agrietado, todavía aguanta unos meses', 'puede_esperar', 1, 1750, null);
  perform public.dt_flota_enviar_cotizacion(o1);

  -- Orden recién recibida: C-987PQR
  o2 := public.dt_flota_crear_orden(u3, 'Falla de arranque en frío', 'normal', null);

  perform public.dt_evento_crear(neg, 'servicio', 'P-456DEF servicio de 180,000 km', 'unidad', u6, cli, ((hoy + 2)::timestamp + time '07:00') at time zone 'America/Guatemala');
  perform public.dt_evento_crear(neg, 'servicio', 'P-123ABC frenos (sugerido)', 'unidad', u1, cli, ((hoy + 6)::timestamp + time '07:00') at time zone 'America/Guatemala');
  -- Inspección de ayer del piloto de P-123ABC y una falla de Mario que el taller no ha atendido (Flota 107 y 108).
  perform prueba.como(piloto);
  perform public.dt_flota_inspeccion(u1, '{"luces":true,"llantas":true,"frenos":true,"aceite":true,"tablero":true}', null, null);
  perform prueba.como(mario);
  perform public.dt_flota_reportar_falla(u2, 'Ruido en la suspensión trasera');
  perform prueba.como(null);
end $$;
update public.flota_inspecciones set en = now() - interval '1 day';

-- Fechas como en la vida real (para la disponibilidad del panel): las unidades llevan meses; la 2301 estuvo 3 días en el
-- taller, la 2302 lleva 2 y la 2303 entró hoy en la mañana.
update public.unidades set creada_en = now() - interval '90 days';
update public.ordenes set creada_en = now() - interval '3 days' where numero = 2301;
update public.ordenes set creada_en = now() - interval '2 days' where numero = 2302;
update public.ordenes set creada_en = now() - interval '5 hours' where numero = 2303;
