# Estado de la construcción

Actualizado: 23 nov 2026. Plan: `docs/antes-de-construir/6-plan-de-construccion.md`.

**Supabase compartido (`xlhaktvymmbnpotkmdct`), corrido el 23 y 24 nov 2026 con todas las verificaciones en true:** núcleo 01–09,
Flota 100–106, Huella 200–207, Fuego 300–309, Colonia 400–407 y Obra 500–507 (lista exacta en `database/corridas-en-supabase.txt`). Lo corrido
NO se cambia en su lugar: todo cambio va en un archivo nuevo (núcleo 10+, Flota 107+, Huella 209+, Fuego 311+, Colonia 408+,
Obra 508+). **Pendiente de correr: Flota 107 (ficha e inspección) y 108 (portal de la empresa y «Hoy»), Huella 208 (foto en la placa perdida) y Fuego 310 (locales de una importación).** `npm run supabase:pendientes` arma un solo archivo con lo que falte y su verificación.

## Etapa 0 · Núcleo

| Paquete | Estado | Dónde |
|---|---|---|
| N-00 Repo y arnés | Hecho | `scripts/` (PGlite, Supabase simulado, recorrido), `apps/flota/web/vercel.json`, `scripts/revisar-salida.mjs` |
| N-01 Acceso | Hecho | `database/nucleo/01_acceso.sql`, `nucleo/acceso/` |
| N-02 Bitácora | Hecho | `02_bitacora.sql` |
| N-03 Cobros | Hecho | `03_cobros.sql`, `supabase/functions/recurrente-*` (llaves de Recurrente por negocio; falta pasarlas a Vault) |
| N-04 Recordatorios | Hecho | `04_recordatorios_eventos.sql`, `supabase/functions/whatsapp-enviar` |
| N-05 Calendario y eventos | Hecho | `04_recordatorios_eventos.sql`, `apps/flota/web/src/panel/Calendario.tsx` |
| N-06 Controles | Hecho | `nucleo/controles/` |
| N-07 Importador genérico | Hecho | `05_importaciones.sql`, `nucleo/importador/` |
| N-08 Suscripción | Hecho, sin tarjeta | `06_suscripcion.sql`. El pago con tarjeta espera que Recurrente confirme el cobro recurrente (D6); mientras, la plataforma anota la transferencia. No hay precios puestos. |

## Etapa 1 · Flota

| Paquete | Estado | Dónde |
|---|---|---|
| F-01 Flotas y unidades + importador | Hecho | `100_flota_base.sql`, `103_flota_importar.sql`, `panel/Unidades.tsx`, `panel/Importar.tsx` |
| F-02 Salud y lo próximo | Hecho | `100_flota_base.sql` (`dt_flota_salud*`), `cliente/Unidad.tsx` |
| F-03 Órdenes | Hecho | `101_flota_ordenes.sql`, `panel/Orden.tsx`, `cliente/Orden.tsx` |
| F-04 Km del piloto | Hecho | `102_flota_piloto.sql`, `104_flota_panel.sql` (`dt_flota_pedir_km`), `cliente/Piloto.tsx` |
| F-05 Cobro y estado de cuenta | Hecho | `101` (cobro por orden), `105_flota_cortes.sql` (corte mensual), `panel/Mas.tsx`, `cliente/Cuenta.tsx` |
| F-06 Calendario | Hecho | eventos del núcleo + `panel/Calendario.tsx` |
| F-07 Panel | Hecho | `104_flota_panel.sql`, `panel/Inicio.tsx` |
| F-SEG | Hecho | `apps/flota/tests/sql/190_ataques.sql` (comunes y 23–26) + ataques en cada paquete; `ataque.mjs --estricto` en 0 |
| Solo lectura en Flota | Hecho | `106_flota_solo_lectura.sql` |
| Ficha de la unidad (24 nov) | Hecho, **107 sin correr** | `107_flota_ficha_inspeccion.sql` (`dt_flota_ficha`, `dt_flota_piloto_editar`, `dt_flota_unidad_baja`), `panel/Unidad.tsx`: salud, pilotos (agregar, reasignar, baja), documentos, km, inspecciones, historial, anotar revisión, abrir orden, dar de baja |
| Inspección de salida del piloto (N-03) | Hecho, **107 sin correr** | `107` (`flota_inspecciones`, `dt_flota_inspeccion`, `dt_flota_piloto_resumen`), `cliente/Piloto.tsx`: cinco puntos y km; lo que está mal queda como falla; ve lo próximo y sus vencimientos |
| Portal de la empresa: Vence, Pilotos, Costos, pedir servicio | Hecho, **108 sin correr** | `108_flota_empresa_y_hoy.sql` (`dt_flota_vencimientos`, `dt_flota_pilotos`, `dt_flota_disponibilidad` abierta a la empresa con la misma firma, `dt_flota_solicitar_servicio`), `cliente/Vence.tsx`, `cliente/Costos.tsx`, `cliente/Unidad.tsx` (lee la ficha; documentos, historial y «Pedir …») |
| «Hoy»: fallas y pedidos sin atender | Hecho, **108 sin correr** | `108` (`dt_flota_avisos`, `dt_flota_atender_aviso`), `panel/Avisos.tsx` en Inicio y, para el técnico, en Órdenes |
| Visita al patio por lote | Hecho, **108 sin correr** | `108` (`dt_flota_agendar_visita`), `panel/Calendario.tsx`: elegir unidades, día y franja; el día de la visita abre todas las órdenes |
| Orden: técnico, entrega, prioridad y recordar | Hecho, **108 sin correr** | `108` (`dt_flota_tecnicos`, `dt_flota_orden_datos`, `dt_flota_recordar_cotizacion`, respeta las 4 horas), `panel/Orden.tsx` |

Después de 107 y 108: Flota 293 comprobaciones (también con todos los productos juntos), 54 ataques (27 y 28 nuevos, 0 funcionan),
18 verificaciones en true, recorrido de pantallas en verde (ficha, inspección, Vence, Costos, visita al patio, avisos) a 1440, 1024,
390 y 375 px.

Sin hacer en Flota (dependen de terceros o de decisiones): WhatsApp al agendar la visita (falta plantilla aprobada por Meta),
foto del tablero y de los hallazgos (bucket privado de fotos), hallazgos con evidencia (`orden_hallazgos`), catálogo de repuestos
con precio, usuarios que la empresa invita sola, informe mensual en PDF, página pública D-TEK Flotas, etiqueta QR de la unidad
para imprimir, ver y reactivar unidades de baja desde la lista (hoy solo desde su ficha).

Pruebas al cierre de Flota: núcleo 102 comprobaciones, Flota 194, 37 ataques (0 funcionan), 13 verificaciones en true,
25 combinaciones de capacidades iguales, funciones en verde, motor del importador 5/5, recorrido de pantallas en verde a
1440, 1024, 390 y 375 px con el CSP de producción.

## Etapa 5 · Obra (construida y corrida en Supabase el 23 nov 2026)

| Paquete | Estado | Dónde |
|---|---|---|
| O-01 Obras, fases y presupuesto (D1) | Hecho | `apps/obra/database/500_obra_base.sql`, `505_obra_importar.sql` (plan desde Excel), `panel/Obras.tsx`, `panel/Plan.tsx` |
| O-02 Gantt con fases que se abren | Hecho | `501_obra_gantt.sql` (`dt_obra_obra`, `dt_obra_fase`), `comun.tsx` (Gantt), `cliente/Avance.tsx`, `cliente/Fase.tsx` |
| O-03 Visita y reporte semanal | Hecho | `502_obra_visitas.sql` (bucket privado `obra-fotos`), `panel/Visita.tsx`, `panel/Reportes.tsx`, `cliente/Reporte.tsx` |
| O-04 Hitos de pago y cambios | Hecho | `500` (hitos), `503_obra_cambios.sql`, `cliente/MiObra.tsx` (decisión), `cliente/Pagos.tsx` |
| O-05 Cobro por hito | Hecho | `504_obra_cobros.sql` (`dt_obra_recibir_fase` crea el cobro), `panel/Mas.tsx` |
| O-SEG | Hecho | `apps/obra/tests/sql/590_ataques.sql` (comunes y 27–30), `ataque.mjs --estricto` en 0 |
| Solo lectura en Obra | Hecho | `506_obra_solo_lectura.sql` |
| Asignar supervisor desde la obra | Hecho | `507_obra_equipo_calendario.sql` (`dt_obra_equipo`), `panel/Plan.tsx` (selector), `panel/Mas.tsx` (Tu equipo) |
| Calendario de visitas | Hecho | `507` (`dt_obra_calendario`: solo obras que le tocan), `panel/Calendario.tsx` (semana/mes, filtro por supervisor y obra; programa con `dt_obra_programar_visita`, mueve con `dt_evento_mover`) |

Pendiente en Obra: enlace del residente sin cuenta, plantillas `obra_*` en `whatsapp-enviar`.

Colonia, después del cierre: reportes nuevos sin ver para la administración (`apps/colonia/database/407_colonia_reportes_sin_ver.sql`,
`panel/Inicio.tsx`, `panel/Reportes.tsx`, punto en la pestaña). Es el aviso mientras no haya plantilla de WhatsApp aprobada para la
administración; cuando Meta la apruebe, se encola desde `dt_colonia_reportar`.

## Fuego · lo que faltaba de pantallas (23 nov 2026)

| Pieza | Estado | Dónde |
|---|---|---|
| Etiquetas QR para imprimir | Hecho | `309` (`dt_fuego_etiquetas`), `panel/Etiquetas.tsx`: QR en SVG con `qrcode-generator` 2.0.4, hoja carta de 10 (4 × 2 in, tipo Avery 5163) |
| Importar clientes, locales y extintores | Hecho | `307` (ya existía), `panel/Importar.tsx` con `nucleo/importador`, vista previa y deshacer 24 h |
| Préstamos (prestar y devolver) | Hecho | `304` + `309` (`dt_fuego_extintores_propios`), `panel/Prestamos.tsx`; se cobra con la visita de hoy si la hay |
| Calendario del mes | Hecho | `309` (`dt_fuego_calendario`), `panel/Calendario.tsx` |

## Lo que necesita a Dominic para publicar Flota

1. ~~Crear el proyecto de Supabase y correr las migraciones~~ Hecho el 23 nov 2026.
2. Sandbox de Recurrente para probar un cobro real de punta a punta (N-03 «terminado cuando»).
3. Cuenta de Meta para WhatsApp Business y las plantillas de `docs/antes-de-construir/8-plantillas-whatsapp.md` aprobadas.
4. Dos archivos reales de flotas (anonimizados) para afinar el importador.
5. El precio de la suscripción por plan.

## Sigue

Etapa 2 · Huella (`apps/huella`, migraciones desde la 200): H-01 dueños y mascotas + importador, H-02 dosis y catálogo de
vacunas, H-03 línea de tiempo y carné, H-04 agenda por carril, H-05 recordatorios, H-06 placa QR (pública), H-07 cobro de
citas, H-SEG ataques 15–18.
