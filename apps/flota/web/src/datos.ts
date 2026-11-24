// Acceso a datos de Flota: un wrapper por función de la base (como DtekBackend en DtekPro). Ninguna pantalla llama a Supabase directo.
import { rpc } from '@nucleo/datos/supabase'

export type EstadoOrden = 'recibida' | 'diagnostico' | 'espera_cliente' | 'en_trabajo' | 'control_calidad' | 'lista' | 'entregada' | 'cancelada'
export type TipoLinea = 'necesario' | 'recomendado' | 'puede_esperar'
export type Respuesta = 'borrador' | 'pendiente' | 'aprobada' | 'aprobada_auto' | 'rechazada'

export type Flota = { id: string; nombre: string; cliente_id: string; unidades: number; credito_dias: number; aprobacion_auto_hasta: number }
export type UnidadFila = {
  id: string; placa: string; marca: string; linea: string; anio: number | null; km_actual: number; km_reportado_en: string | null; estado: string
  piloto: string | null; puntaje: number; ahora: number; cerca: number; conocidas: number; proximo: string | null; documento_vence: string | null; documento_tipo: string | null
}
export type Salud = { puntaje: number; ahora: number; cerca: number; conocidas: number; total: number; proximo_componente: string | null; proximo_nombre: string | null; proximo_detalle: string | null; proximo_tono: string | null; km_reciente: boolean }
export type Pieza = { componente: string; nombre: string; grupo: string; tono: 'vencido' | 'proximo' | 'al_dia' | 'sin_datos'; uso: number | null; detalle: string; realizado_en: string | null }
export type OrdenFila = { id: string; numero: number; placa: string; flota: string; motivo: string; estado: EstadoOrden; prioridad: 'normal' | 'urgente'; total: number; pendientes: number; creada_en: string; entrega_prometida: string | null }
export type Linea = { id: string; descripcion: string; explicacion: string; tipo: TipoLinea; cantidad: number; precio: number; total: number; respuesta: Respuesta; hecha: boolean; componente: string | null }
export type Orden = {
  id: string; numero: number; motivo: string; diagnostico: string | null; estado: EstadoOrden; prioridad: 'normal' | 'urgente'; entrega_prometida: string | null; creada_en: string
  unidad: { id: string; placa: string; marca: string; linea: string; anio: number | null; km: number }
  flota: { id: string; nombre: string; aprobacion_auto_hasta: number; credito_dias: number }
  tecnico: string | null; puedo_aprobar: boolean; total_aprobado: number; lineas: Linea[]
  recepcion: { km: number; combustible_octavos: number; danos: string | null; fotos: string[]; firmo_nombre: string; firmo_en: string } | null
  pasos: { accion: string; en: string }[]; sello: { eslabones: number } | null
}
export type CuentaFila = { cobro_id: string; concepto: string; monto: number; pagado: number; saldo: number; vence: string | null; estado: string; creado_en: string; origen: string; agrupado_en: string | null }
export type Corte = { id: string; hasta: string; cobro_id: string; ordenes: number; monto: number; pagado: number; saldo: number; vence: string | null; estado: string }
export type CortePrevio = { cobro_id: string; concepto: string; saldo: number; creado_en: string }
export type Evento = { id: string; tipo: string; titulo: string; programada_para: string; realizada_en: string | null; estado: string; cliente_id: string | null; objeto: string | null; objeto_id: string | null }

export type Disponibilidad = { unidad_id: string; placa: string; descripcion: string; dias: number; dias_taller: number; disponibilidad: number; costo: number | null; ordenes: number }
export type Vence = { tipo: 'documento' | 'licencia'; que: string; unidad_id: string | null; placa: string | null; flota: string; vence: string }
export type Panel = {
  unidades: number; en_taller: number; ordenes_abiertas: number; esperando_empresa: number; listas_para_entregar: number; sin_km_reciente: number
  cobrado_mes: number | null; facturado_mes: number | null; por_cobrar: number | null; vencidos: number | null; vence: Vence[]
}

export type Ficha = {
  unidad: { id: string; placa: string; marca: string; linea: string; anio: number | null; vin: string | null; km: number; km_reportado_en: string | null; estado: string; flota_id: string; flota: string; baja_motivo: string | null }
  pilotos: { id: string; nombre: string; telefono: string | null; licencia_tipo: string | null; licencia_vence: string | null; ligado: boolean }[]
  documentos: { id: string; tipo: string; numero: string | null; vence: string }[]
  km: { km: number; en: string; rechazado: boolean; quien: string | null }[]
  inspecciones: { en: string; todo_bien: boolean; items: Record<string, boolean>; km: number | null; nota: string | null; quien: string | null }[]
  ordenes: { id: string; numero: number; motivo: string; estado: EstadoOrden; creada_en: string; total: number }[]
  taller: boolean; puedo_pedir: boolean; solicitud_abierta: string | null
}
export type PilotoFila = { id: string; nombre: string; telefono: string | null; unidad_id: string | null; placa: string | null; licencia_tipo: string | null; licencia_vence: string | null; ligado: boolean }
export type Vencimiento = { tipo: 'servicio' | 'documento' | 'licencia'; que: string; unidad_id: string | null; placa: string | null; quien: string | null; vence: string | null; estimada: boolean; detalle: string | null }
export type Aviso = { evento_id: string; tipo: 'falla' | 'solicitud'; titulo: string; unidad_id: string; placa: string; flota: string; en: string; quien: string | null }
export type ResumenPiloto = {
  proximo: string | null; proximo_detalle: string | null; proximo_tono: string | null; conocidas: number
  documentos: { tipo: string; vence: string }[]; licencia_vence: string | null; inspeccion_hoy: { en: string; todo_bien: boolean } | null
}
export type Tecnico = { persona_id: string; nombre: string; rol: string }
// Lo que el piloto revisa antes de salir (mismo orden que dt_flota_items_inspeccion).
export const ITEMS_INSPECCION: { clave: string; texto: string }[] = [
  { clave: 'luces', texto: 'Luces' }, { clave: 'llantas', texto: 'Llantas' }, { clave: 'frenos', texto: 'Frenos' },
  { clave: 'aceite', texto: 'Aceite' }, { clave: 'tablero', texto: 'Tablero sin luces de alerta' },
]

export const Flota = {
  panel: (negocio: string) => rpc<Panel>('dt_flota_panel', { p_negocio: negocio }),
  disponibilidad: (flota: string, mes: string | null) => rpc<Disponibilidad[]>('dt_flota_disponibilidad', { p_flota: flota, p_mes: mes }),
  pedirKm: (unidades: string[]) => rpc<{ enviados: number; sin_telefono: number }>('dt_flota_pedir_km', { p_unidades: unidades }),
  avisarDocumentos: (unidades: string[]) => rpc<{ enviados: number }>('dt_flota_avisar_documentos', { p_unidades: unidades }),
  importar: <T>(flota: string, filas: unknown[], archivo: string | null, cuenta: unknown) =>
    rpc<T>('dt_flota_importar', { p_flota: flota, p_filas: filas, p_archivo: archivo, p_cuenta: cuenta }),
  deshacerImportacion: (imp: string) => rpc<{ borradas: number; con_ordenes: number }>('dt_flota_deshacer_importacion', { p_importacion: imp }),
  flotas: (negocio: string) => rpc<Flota[]>('dt_flota_flotas', { p_negocio: negocio }),
  crearCliente: (negocio: string, nombre: string, telefono: string, nit: string | null) =>
    rpc<string>('dt_crear_cliente', { p_negocio: negocio, p_nombre: nombre, p_telefono: telefono, p_nit: nit, p_tipo: 'empresa' }),
  crearFlota: (negocio: string, cliente: string, nombre: string, creditoDias: number, tope: number) =>
    rpc<string>('dt_flota_crear', { p_negocio: negocio, p_cliente: cliente, p_nombre: nombre, p_credito_dias: creditoDias, p_aprobacion_auto: tope }),
  unidades: (flota: string) => rpc<UnidadFila[]>('dt_flota_unidades', { p_flota: flota }),
  agregarUnidad: (flota: string, placa: string, marca: string, linea: string, anio: number, km: number) =>
    rpc<string>('dt_flota_agregar_unidad', { p_flota: flota, p_placa: placa, p_marca: marca, p_linea: linea, p_anio: anio, p_km: km }),
  ficha: (unidad: string) => rpc<Ficha>('dt_flota_ficha', { p_unidad: unidad }),
  documento: (unidad: string, tipo: string, numero: string | null, vence: string) =>
    rpc<string>('dt_flota_documento', { p_unidad: unidad, p_tipo: tipo, p_numero: numero, p_vence: vence, p_archivo: null }),
  agregarPiloto: (flota: string, nombre: string, telefono: string | null, unidad: string | null, licenciaTipo: string | null, licenciaVence: string | null) =>
    rpc<string>('dt_flota_agregar_piloto', { p_flota: flota, p_nombre: nombre, p_telefono: telefono, p_unidad: unidad, p_licencia_tipo: licenciaTipo, p_licencia_vence: licenciaVence }),
  editarPiloto: (piloto: string, unidad: string | null, licenciaTipo: string | null, licenciaVence: string | null, activo: boolean) =>
    rpc<void>('dt_flota_piloto_editar', { p_piloto: piloto, p_unidad: unidad, p_licencia_tipo: licenciaTipo, p_licencia_vence: licenciaVence, p_activo: activo }),
  pilotos: (flota: string) => rpc<PilotoFila[]>('dt_flota_pilotos', { p_flota: flota }),
  unidadBaja: (unidad: string, baja: boolean, motivo: string | null) => rpc<void>('dt_flota_unidad_baja', { p_unidad: unidad, p_baja: baja, p_motivo: motivo }),
  anotarPieza: (unidad: string, componente: string, fecha: string, km: number | null, resultado: string) =>
    rpc<string>('dt_flota_anotar_pieza', { p_unidad: unidad, p_componente: componente, p_fecha: fecha, p_km: km, p_resultado: resultado }),
  inspeccion: (unidad: string, items: Record<string, boolean>, km: number | null, nota: string | null) =>
    rpc<{ todo_bien: boolean; km: string | null; falla: string | null }>('dt_flota_inspeccion', { p_unidad: unidad, p_items: items, p_km: km, p_nota: nota }),
  resumenPiloto: (unidad: string) => rpc<ResumenPiloto>('dt_flota_piloto_resumen', { p_unidad: unidad }),
  vencimientos: (flota: string, dias = 60) => rpc<Vencimiento[]>('dt_flota_vencimientos', { p_flota: flota, p_dias: dias }),
  solicitarServicio: (unidad: string, que: string) => rpc<string>('dt_flota_solicitar_servicio', { p_unidad: unidad, p_que: que }),
  misSolicitudes: (flota: string) => rpc<{ evento_id: string; unidad_id: string; titulo: string; en: string }[]>('dt_flota_mis_solicitudes', { p_flota: flota }),
  avisos: (negocio: string) => rpc<Aviso[]>('dt_flota_avisos', { p_negocio: negocio }),
  atenderAviso: (evento: string, abrir: boolean) => rpc<string | null>('dt_flota_atender_aviso', { p_evento: evento, p_abrir: abrir, p_motivo: null }),
  agendarVisita: (flota: string, unidades: string[], cuando: string, motivo: string) =>
    rpc<number>('dt_flota_agendar_visita', { p_flota: flota, p_unidades: unidades, p_cuando: cuando, p_motivo: motivo }),
  tecnicos: (negocio: string) => rpc<Tecnico[]>('dt_flota_tecnicos', { p_negocio: negocio }),
  ordenDatos: (orden: string, tecnico: string | null, entrega: string | null, prioridad: 'normal' | 'urgente') =>
    rpc<void>('dt_flota_orden_datos', { p_orden: orden, p_tecnico: tecnico, p_entrega: entrega, p_prioridad: prioridad }),
  recordarCotizacion: (orden: string) => rpc<{ enviado: boolean; motivo: string | null }>('dt_flota_recordar_cotizacion', { p_orden: orden }),
  salud: async (unidad: string) => (await rpc<Salud[]>('dt_flota_salud', { p_unidad: unidad }))[0],
  piezas: (unidad: string) => rpc<Pieza[]>('dt_flota_piezas', { p_unidad: unidad }),
  reportarKm: (unidad: string, km: number) => rpc<string>('dt_flota_reportar_km', { p_unidad: unidad, p_km: km }),
  miUnidad: async (negocio: string) => (await rpc<{ unidad_id: string; placa: string; marca: string; linea: string; anio: number | null; km_actual: number; km_reportado_en: string | null; flota: string }[]>('dt_flota_mi_unidad', { p_negocio: negocio }))[0] ?? null,
  reportarFalla: (unidad: string, texto: string) => rpc<string>('dt_flota_reportar_falla', { p_unidad: unidad, p_texto: texto }),
  ordenes: (negocio: string, abiertas = true) => rpc<OrdenFila[]>('dt_flota_ordenes', { p_negocio: negocio, p_abiertas: abiertas }),
  orden: (id: string) => rpc<Orden>('dt_flota_orden', { p_orden: id }),
  crearOrden: (unidad: string, motivo: string, prioridad: string, entrega: string | null) =>
    rpc<string>('dt_flota_crear_orden', { p_unidad: unidad, p_motivo: motivo, p_prioridad: prioridad, p_entrega: entrega }),
  recepcion: (orden: string, km: number, combustible: number, danos: string, firmo: string) =>
    rpc<void>('dt_flota_recepcion', { p_orden: orden, p_km: km, p_combustible: combustible, p_danos: danos, p_fotos: [], p_firmo: firmo }),
  diagnostico: (orden: string, texto: string) => rpc<void>('dt_flota_diagnostico', { p_orden: orden, p_texto: texto }),
  cotizarLinea: (orden: string, l: { descripcion: string; explicacion: string; tipo: TipoLinea; cantidad: number; precio: number; componente: string | null }) =>
    rpc<string>('dt_flota_cotizar_linea', { p_orden: orden, p_descripcion: l.descripcion, p_explicacion: l.explicacion, p_tipo: l.tipo, p_cantidad: l.cantidad, p_precio: l.precio, p_componente: l.componente }),
  quitarLinea: (linea: string) => rpc<void>('dt_flota_quitar_linea', { p_linea: linea }),
  enviarCotizacion: (orden: string) => rpc<{ automaticas: number; pendientes: number }>('dt_flota_enviar_cotizacion', { p_orden: orden }),
  responderLinea: (linea: string, aprobar: boolean) => rpc<void>('dt_flota_responder_linea', { p_linea: linea, p_aprobar: aprobar }),
  marcarLinea: (linea: string, hecha: boolean) => rpc<void>('dt_flota_marcar_linea', { p_linea: linea, p_hecha: hecha }),
  mover: (orden: string, a: EstadoOrden, motivo?: string) => rpc<void>('dt_flota_mover_orden', { p_orden: orden, p_a: a, p_motivo: motivo ?? null }),
  estadoCuenta: (flota: string) => rpc<CuentaFila[]>('dt_flota_estado_cuenta', { p_flota: flota }),
  cortePrevio: (flota: string) => rpc<CortePrevio[]>('dt_flota_corte_previo', { p_flota: flota, p_hasta: null }),
  cerrarCorte: (flota: string) => rpc<{ corte: string; cobro: string; total: number; ordenes: number; vence: string }>('dt_flota_cerrar_corte', { p_flota: flota, p_hasta: null }),
  cortes: (flota: string) => rpc<Corte[]>('dt_flota_cortes', { p_flota: flota }),
  eventos: (negocio: string, desde: string, hasta: string) => rpc<Evento[]>('dt_eventos', { p_negocio: negocio, p_desde: desde, p_hasta: hasta }),
  moverEvento: (evento: string, cuando: string, avisar: boolean) => rpc<string | null>('dt_evento_mover', { p_evento: evento, p_cuando: cuando, p_avisar: avisar }),
}

export const ESTADOS: Record<EstadoOrden, { texto: string; cliente: string; tono: 'bien' | 'aviso' | 'mal' | 'neutro' }> = {
  recibida: { texto: 'Recibida', cliente: 'Recibido', tono: 'neutro' },
  diagnostico: { texto: 'Diagnóstico', cliente: 'Diagnóstico', tono: 'neutro' },
  espera_cliente: { texto: 'Espera al cliente', cliente: 'Tu aprobación', tono: 'aviso' },
  en_trabajo: { texto: 'En trabajo', cliente: 'En trabajo', tono: 'neutro' },
  control_calidad: { texto: 'Control de calidad', cliente: 'Control de calidad', tono: 'neutro' },
  lista: { texto: 'Lista', cliente: 'Listo', tono: 'bien' },
  entregada: { texto: 'Entregada', cliente: 'Entregado', tono: 'bien' },
  cancelada: { texto: 'Cancelada', cliente: 'Cancelado', tono: 'mal' },
}

// Los seis pasos de la orden en vivo (OrdenEnVivo.tsx de DtekPro) con su hora sacada de la bitácora.
const ORDEN_PASOS: { estado: EstadoOrden; accion: string[] }[] = [
  { estado: 'recibida', accion: ['recibida'] },
  { estado: 'diagnostico', accion: ['diagnostico'] },
  { estado: 'espera_cliente', accion: ['cotizacion_enviada'] },
  { estado: 'en_trabajo', accion: ['en_trabajo'] },
  { estado: 'control_calidad', accion: ['control_calidad'] },
  { estado: 'lista', accion: ['lista'] },
]
export function pasosDe(o: Orden, cliente = false) {
  const idx = Math.max(0, ORDEN_PASOS.findIndex((p) => p.estado === (o.estado === 'entregada' ? 'lista' : o.estado)))
  const terminado = o.estado === 'entregada'
  return ORDEN_PASOS.map((p, i) => {
    const marca = [...o.pasos].reverse().find((x) => p.accion.includes(x.accion))
    return { nombre: cliente ? ESTADOS[p.estado].cliente : ESTADOS[p.estado].texto, hora: marca && i <= idx ? new Date(marca.en).toLocaleString('es-GT', { timeZone: 'America/Guatemala', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '', estado: (i < idx || terminado ? 'hecho' : i === idx ? 'aqui' : 'falta') as 'hecho' | 'aqui' | 'falta' }
  })
}

export const TIPOS: { valor: TipoLinea; texto: string; sub: string; tono: 'mal' | 'aviso' | 'neutro' }[] = [
  { valor: 'necesario', texto: 'Necesario', sub: 'sin esto no se arregla', tono: 'mal' },
  { valor: 'recomendado', texto: 'Recomendado', sub: 'conviene hacerlo ya', tono: 'aviso' },
  { valor: 'puede_esperar', texto: 'Puede esperar', sub: 'se anota para después', tono: 'neutro' },
]

export const COMPONENTES: { clave: string; nombre: string }[] = [
  { clave: 'engine_oil', nombre: 'Aceite y filtro' }, { clave: 'engine_air_filter', nombre: 'Filtro de aire' }, { clave: 'cabin_air_filter', nombre: 'Filtro de cabina' },
  { clave: 'fuel_filter', nombre: 'Filtro de combustible' }, { clave: 'spark_plugs', nombre: 'Candelas' }, { clave: 'coolant', nombre: 'Refrigerante' },
  { clave: 'transmission_fluid', nombre: 'Aceite de transmisión' }, { clave: 'tire_rotation', nombre: 'Rotación de llantas' }, { clave: 'front_brakes', nombre: 'Frenos delanteros' },
  { clave: 'rear_brakes', nombre: 'Frenos traseros' }, { clave: 'tires', nombre: 'Llantas' }, { clave: 'battery', nombre: 'Batería' }, { clave: 'suspension', nombre: 'Suspensión' },
]
