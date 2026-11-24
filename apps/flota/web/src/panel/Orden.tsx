// Orden de trabajo del taller: pasos, recepción firmada, diagnóstico, cotización por línea, trabajo y bitácora.
// Cada botón aparece solo si el paso es posible y la persona tiene la capacidad; la base vuelve a validar todo.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { Ayuda, BotonesSel, Chip, Contador, Fecha, Pasos, useAvisoDeshacer } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { dinero, fechaLarga, hoyGT, hora, km as fmtKm } from '@nucleo/formato'
import { COMPONENTES, ESTADOS, Flota, TIPOS, pasosDe, type EstadoOrden, type Orden, type TipoLinea } from '../datos'
import { Error } from '../comun'

const RESP: Record<string, { texto: string; tono: 'bien' | 'aviso' | 'mal' | 'neutro' }> = {
  borrador: { texto: 'Sin enviar', tono: 'neutro' }, pendiente: { texto: 'Esperando', tono: 'aviso' }, aprobada: { texto: 'Aprobada', tono: 'bien' },
  aprobada_auto: { texto: 'Aprobada sola', tono: 'bien' }, rechazada: { texto: 'No aprobada', tono: 'mal' },
}

export function OrdenPanel() {
  const { id } = useParams()
  const { datos: o, error, cargando, recargar } = useCarga(() => Flota.orden(id!), [id])
  if (cargando && !o) return <p className="cargando">Cargando la orden…</p>
  if (error) return <p className="error-texto">{error}</p>
  if (!o) return null
  return <Detalle o={o} recargar={recargar} />
}

function Detalle({ o, recargar }: { o: Orden; recargar: () => void }) {
  const { puede } = useSesion()
  const acc = useAccion()
  const accion = (fn: () => Promise<unknown>) => acc.correr(fn).then((ok) => { if (ok) recargar() })
  const aprobadas = o.lineas.filter((l) => l.respuesta === 'aprobada' || l.respuesta === 'aprobada_auto')
  const borradores = o.lineas.filter((l) => l.respuesta === 'borrador')
  const pendientes = o.lineas.filter((l) => l.respuesta === 'pendiente')
  const siguientes: { a: EstadoOrden; texto: string; cap: Parameters<typeof puede>[0]; sec?: boolean }[] = ({
    recibida: [],
    diagnostico: [],
    espera_cliente: aprobadas.length ? [{ a: 'en_trabajo', texto: 'Empezar el trabajo', cap: 'registrar_trabajo' }] : [],
    en_trabajo: [{ a: 'control_calidad', texto: 'Pasar a control de calidad', cap: 'registrar_trabajo' }],
    control_calidad: [{ a: 'lista', texto: 'Dar por lista y cobrar', cap: 'verificar_trabajo' }, { a: 'en_trabajo', texto: 'Devolver a trabajo', cap: 'registrar_trabajo', sec: true }],
    lista: [{ a: 'entregada', texto: 'Entregar la unidad', cap: 'ver_ordenes' }],
    entregada: [], cancelada: [],
  } as Record<EstadoOrden, { a: EstadoOrden; texto: string; cap: Parameters<typeof puede>[0]; sec?: boolean }[]>)[o.estado].filter((s) => puede(s.cap))

  return (
    <>
      <div className="titulo-pagina">
        <div>
          <Link to="/panel/ordenes" className="chico">‹ Órdenes</Link>
          <h1>Orden {o.numero} · {o.unidad.placa}</h1>
          <span className="suave chico">{o.flota.nombre} · {o.unidad.marca} {o.unidad.linea} {o.unidad.anio ?? ''} · {o.motivo}</span>
        </div>
        <div className="fila envolver">
          {o.prioridad === 'urgente' && <Chip tono="mal">Urgente</Chip>}
          <Chip tono={ESTADOS[o.estado].tono}>{ESTADOS[o.estado].texto}</Chip>
        </div>
      </div>
      <Error texto={acc.error} />
      <div className="grilla-2">
        <div className="columna" style={{ gap: 20 }}>
          <section className="tarjeta">
            <div className="fila-entre"><h2>En qué va</h2>{o.entrega_prometida && <span className="suave chico">Entrega prometida: {fechaLarga(o.entrega_prometida)} {hora(o.entrega_prometida)}</span>}</div>
            <Pasos pasos={pasosDe(o)} />
            {(siguientes.length > 0 || (puede('cotizar') && !['entregada', 'cancelada'].includes(o.estado))) && (
              <div className="fila envolver">
                {siguientes.map((s) => <button key={s.a} className={`btn ${s.sec ? 'btn-sec' : ''}`} disabled={acc.ocupado} onClick={() => accion(() => Flota.mover(o.id, s.a))}>{s.texto}</button>)}
                {puede('cotizar') && !['entregada', 'cancelada', 'lista'].includes(o.estado) && <Cancelar alCancelar={(m) => accion(() => Flota.mover(o.id, 'cancelada', m))} />}
              </div>
            )}
          </section>

          {(o.estado === 'recibida' || o.estado === 'diagnostico') && puede('registrar_trabajo') && <Diagnostico o={o} accion={accion} />}
          {o.diagnostico && o.estado !== 'recibida' && o.estado !== 'diagnostico' && <section className="tarjeta"><h2>Diagnóstico</h2><p style={{ margin: 0 }}>{o.diagnostico}</p><span className="suave chico">{o.tecnico ? `Técnico: ${o.tecnico}` : ''}</span></section>}

          <section className="tarjeta">
            <div className="fila-entre">
              <h2>Cotización · la empresa aprueba línea por línea</h2>
              <span className="suave chico">{o.flota.aprobacion_auto_hasta > 0 ? `Regla de la empresa: menos de ${dinero(o.flota.aprobacion_auto_hasta)} se aprueba solo` : 'Sin aprobación automática'}</span>
            </div>
            {o.lineas.length === 0 ? <p className="vacio">Todavía no hay líneas.</p> : (
              <div className="caja-tabla">
                <table className="tabla">
                  <thead><tr><th>Línea</th><th>Tipo <Ayuda texto="Necesario: sin esto no se arregla. Recomendado: conviene hacerlo ya. Puede esperar: se anota para después." /></th><th>Total</th><th>Respuesta</th>{['en_trabajo', 'control_calidad'].includes(o.estado) && <th>Hecha</th>}<th /></tr></thead>
                  <tbody>
                    {o.lineas.map((l) => {
                      const tipo = TIPOS.find((t) => t.valor === l.tipo)!
                      return (
                        <tr key={l.id}>
                          <td><b>{l.descripcion}</b><div className="suave chico">{l.explicacion}</div></td>
                          <td><Chip tono={tipo.tono}>{tipo.texto}</Chip></td>
                          <td><b>{dinero(l.total)}</b>{l.cantidad !== 1 && <div className="suave chico">{l.cantidad} × {dinero(l.precio)}</div>}</td>
                          <td><Chip tono={RESP[l.respuesta].tono}>{RESP[l.respuesta].texto}</Chip></td>
                          {['en_trabajo', 'control_calidad'].includes(o.estado) && (
                            <td>{(l.respuesta === 'aprobada' || l.respuesta === 'aprobada_auto') && puede('registrar_trabajo') && (
                              <input type="checkbox" aria-label={`Hecha: ${l.descripcion}`} checked={l.hecha} disabled={acc.ocupado} onChange={(e) => accion(() => Flota.marcarLinea(l.id, e.target.checked))} style={{ width: 22, height: 22, accentColor: 'var(--acento)' }} />
                            )}</td>
                          )}
                          <td>{l.respuesta === 'borrador' && puede('cotizar') && <button className="btn-texto" onClick={() => accion(() => Flota.quitarLinea(l.id))}>Quitar</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="fila-entre envolver">
              <span className="suave">Aprobado {dinero(o.total_aprobado)}{pendientes.length > 0 && ` · ${pendientes.length} esperando a la empresa`}</span>
              {puede('cotizar') && o.estado === 'espera_cliente' && pendientes.length > 0 && borradores.length === 0 && <Recordar orden={o.id} />}
              {puede('cotizar') && borradores.length > 0 && <button className="btn" disabled={acc.ocupado} onClick={() => accion(() => Flota.enviarCotizacion(o.id))}>Enviar {borradores.length} línea{borradores.length > 1 ? 's' : ''} a la empresa</button>}
            </div>
            {puede('cotizar') && ['recibida', 'diagnostico', 'espera_cliente'].includes(o.estado) && <NuevaLinea orden={o.id} accion={accion} />}
          </section>

          <section className="tarjeta">
            <div className="fila-entre"><h2>Bitácora de la orden</h2><span className="suave chico">no se puede editar ni borrar</span></div>
            <ol className="lista-filas" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...o.pasos].reverse().map((p, i) => <li key={i} className="fila-dato"><span className="titulo">{NOMBRE_ACCION[p.accion] ?? p.accion}</span><span className="sub">{fechaLarga(p.en)} {hora(p.en)}</span></li>)}
            </ol>
          </section>
        </div>

        <div className="columna" style={{ gap: 20 }}>
          <DatosOrden o={o} accion={accion} />
          <Recepcion o={o} accion={accion} />
          <div className="preview">
            <span className="etiqueta" style={{ color: 'var(--acento-oscuro)' }}>Así lo ve la empresa</span>
            <div>
              {o.estado === 'espera_cliente' && pendientes.length > 0 ? (
                <><strong>El taller espera tu respuesta</strong><span className="suave chico">{o.unidad.placa} · {pendientes.length} línea{pendientes.length > 1 ? 's' : ''} por aprobar · {dinero(pendientes.reduce((s, l) => s + l.total, 0))}</span></>
              ) : (
                <><strong>{o.unidad.placa} · {ESTADOS[o.estado].cliente}</strong><span className="suave chico">Aprobado {dinero(o.total_aprobado)}</span></>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// Técnico, entrega prometida y prioridad (se pueden cambiar mientras la orden está abierta).
function DatosOrden({ o, accion }: { o: Orden; accion: (fn: () => Promise<unknown>) => void }) {
  const { negocio, puede } = useSesion()
  const tecnicos = useCarga(() => Flota.tecnicos(negocio!.negocio_id), [negocio!.negocio_id])
  const [editando, setEditando] = useState(false)
  const actualTec = tecnicos.datos?.find((t) => t.nombre === o.tecnico)?.persona_id ?? null
  const [tec, setTec] = useState<string | null>(null)
  const [entrega, setEntrega] = useState<string | null>(null)
  const [prioridad, setPrioridad] = useState<'normal' | 'urgente'>(o.prioridad)
  const abierta = !['entregada', 'cancelada'].includes(o.estado)
  const diaEntrega = o.entrega_prometida ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(o.entrega_prometida)) : null
  const abrir = () => { setTec(actualTec); setEntrega(diaEntrega); setPrioridad(o.prioridad); setEditando(true) }
  return (
    <section className="tarjeta">
      <div className="fila-entre"><h2>Datos de la orden</h2>{abierta && puede('ver_ordenes') && !editando && <button className="btn-texto" onClick={abrir}>Cambiar</button>}</div>
      {!editando ? (
        <div className="grilla-campos" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><div className="suave chico">Técnico</div><b>{o.tecnico || 'Sin asignar'}</b></div>
          <div><div className="suave chico">Entrega prometida</div><b>{o.entrega_prometida ? `${fechaLarga(o.entrega_prometida)} ${hora(o.entrega_prometida)}` : 'Sin fecha'}</b></div>
          <div><div className="suave chico">Prioridad</div><b>{o.prioridad === 'urgente' ? 'Urgente' : 'Normal'}</b></div>
        </div>
      ) : (
        <div className="columna">
          <BotonesSel rotulo="Técnico" valor={tec} alCambiar={setTec} opciones={(tecnicos.datos || []).map((t) => ({ valor: t.persona_id, texto: t.nombre }))} />
          <Fecha rotulo="Entrega prometida (5 de la tarde)" valor={entrega} alCambiar={setEntrega} min={hoyGT()} />
          <BotonesSel rotulo="Prioridad" valor={prioridad} alCambiar={setPrioridad} opciones={[{ valor: 'normal', texto: 'Normal' }, { valor: 'urgente', texto: 'Urgente', sub: 'unidad parada' }]} />
          <div className="fila envolver">
            <button className="btn btn-chico" onClick={() => { setEditando(false); accion(() => Flota.ordenDatos(o.id, tec, entrega ? (entrega === diaEntrega ? o.entrega_prometida : `${entrega}T17:00:00-06:00`) : null, prioridad)) }}>Guardar</button>
            <button className="btn-texto" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

// Volver a mandar el WhatsApp de la cotización a la empresa (la base no lo repite antes de 4 horas).
function Recordar({ orden }: { orden: string }) {
  const acc = useAccion()
  const aviso = useAvisoDeshacer()
  return (
    <>
      <button className="btn btn-sec" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
        const r = await Flota.recordarCotizacion(orden)
        aviso.mostrar(r.enviado ? 'Le recordamos a la empresa por WhatsApp.' : r.motivo === 'repetido_en_4_horas' ? 'Ya se le avisó en las últimas 4 horas.' : 'No se pudo mandar el recordatorio (tope de mensajes del mes).')
      })}>Recordar a la empresa</button>
      <Error texto={acc.error} />
      {aviso.nodo}
    </>
  )
}

const NOMBRE_ACCION: Record<string, string> = {
  recibida: 'Unidad recibida', recepcion_firmada: 'Recepción firmada', diagnostico: 'Diagnóstico', cotizacion_enviada: 'Cotización enviada a la empresa',
  en_trabajo: 'En trabajo', control_calidad: 'Control de calidad', lista: 'Lista y cobro creado', entregada: 'Entregada', cancelada: 'Cancelada',
  datos_cambiados: 'Técnico, entrega o prioridad cambiados', cotizacion_recordada: 'Se le recordó a la empresa',
}

function Recepcion({ o, accion }: { o: Orden; accion: (fn: () => Promise<unknown>) => void }) {
  const { puede } = useSesion()
  const [kmv, setKm] = useState(o.unidad.km)
  const [comb, setComb] = useState(4)
  const [danos, setDanos] = useState('')
  const [firmo, setFirmo] = useState('')
  if (o.recepcion) {
    const r = o.recepcion
    return (
      <section className="tarjeta">
        <h2>Recepción firmada</h2>
        <div className="grilla-campos" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div><div className="suave chico">Kilometraje</div><b>{fmtKm(r.km)}</b></div>
          <div><div className="suave chico">Tanque</div><b>{r.combustible_octavos} de 8</b></div>
          <div><div className="suave chico">Daños</div><b>{r.danos || 'Sin daños marcados'}</b></div>
          <div><div className="suave chico">Firmó</div><b>{r.firmo_nombre}</b><div className="suave chico">{hora(r.firmo_en)}</div></div>
        </div>
      </section>
    )
  }
  if (!puede('ver_ordenes') || ['entregada', 'cancelada'].includes(o.estado)) return null
  return (
    <section className="tarjeta">
      <h2>Recepción de la unidad</h2>
      <Contador rotulo="Kilometraje" valor={kmv} paso={100} unidad="km" alCambiar={setKm} sub={`Último registrado: ${fmtKm(o.unidad.km)}`} />
      <BotonesSel rotulo="Tanque" valor={String(comb)} alCambiar={(v) => setComb(Number(v))} opciones={['0', '2', '4', '6', '8'].map((v) => ({ valor: v, texto: v === '0' ? 'Vacío' : v === '8' ? 'Lleno' : `${v}/8` }))} />
      <div className="campo"><label htmlFor="danos">Daños que tiene al llegar</label><textarea id="danos" className="entrada" value={danos} onChange={(e) => setDanos(e.target.value)} placeholder="Golpe en la puerta izquierda" /></div>
      <div className="campo"><label htmlFor="firmo">Quién entrega (nombre)</label><input id="firmo" className="entrada" value={firmo} onChange={(e) => setFirmo(e.target.value)} /></div>
      <button className="btn" onClick={() => accion(() => Flota.recepcion(o.id, kmv, comb, danos, firmo))}>Firmar recepción</button>
    </section>
  )
}

function Diagnostico({ o, accion }: { o: Orden; accion: (fn: () => Promise<unknown>) => void }) {
  const [t, setT] = useState(o.diagnostico || '')
  return (
    <section className="tarjeta">
      <h2>Diagnóstico</h2>
      <div className="campo"><label htmlFor="diag">Qué encontró el técnico</label><textarea id="diag" className="entrada" value={t} onChange={(e) => setT(e.target.value)} placeholder="Embrague patina en tercera y cuarta" /></div>
      <div><button className="btn btn-sec" onClick={() => accion(() => Flota.diagnostico(o.id, t))}>Guardar diagnóstico</button></div>
    </section>
  )
}

function NuevaLinea({ orden, accion }: { orden: string; accion: (fn: () => Promise<unknown>) => Promise<void> | void }) {
  const [descripcion, setDescripcion] = useState('')
  const [explicacion, setExplicacion] = useState('')
  const [tipo, setTipo] = useState<TipoLinea | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [precio, setPrecio] = useState(0)
  const [componente, setComponente] = useState('')
  const [falta, setFalta] = useState('')
  const agregar = async () => {
    if (descripcion.trim().length < 2 || explicacion.trim().length < 3 || !tipo || precio < 0) { setFalta('Completá qué es, cómo se lo explicás a la empresa y el tipo.'); return }
    setFalta('')
    await accion(() => Flota.cotizarLinea(orden, { descripcion, explicacion, tipo, cantidad, precio, componente: componente || null }))
    setDescripcion(''); setExplicacion(''); setTipo(null); setCantidad(1); setPrecio(0); setComponente('')
  }
  return (
    <div className="columna" style={{ borderTop: '1px solid var(--linea)', paddingTop: 14 }}>
      <strong>Agregar línea</strong>
      <div className="grilla-campos">
        <div className="campo"><label htmlFor="desc">Repuesto o trabajo</label><input id="desc" className="entrada" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Kit de embrague y collarín" /></div>
        <div className="campo"><label htmlFor="expl">Cómo se lo explicás a la empresa</label><input id="expl" className="entrada" value={explicacion} onChange={(e) => setExplicacion(e.target.value)} placeholder="Desgastado: impide meter tercera" /></div>
      </div>
      <BotonesSel rotulo="Tipo" ayuda="La empresa ve este tipo junto a cada línea." valor={tipo} alCambiar={setTipo} opciones={TIPOS.map((t) => ({ valor: t.valor, texto: t.texto, sub: t.sub }))} />
      <div className="grilla-campos">
        <Contador rotulo="Cantidad" valor={cantidad} min={1} alCambiar={setCantidad} />
        <div className="campo"><label htmlFor="precio">Precio unitario</label>
          <div className="fila" style={{ gap: 0, border: '1px solid #D6D3D1', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
            <span style={{ padding: '0 10px', fontWeight: 700, background: '#F5F5F4', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>Q</span>
            <input id="precio" inputMode="decimal" className="entrada" style={{ border: 'none' }} value={precio ? String(precio) : ''} onChange={(e) => setPrecio(Number(e.target.value.replace(/[^0-9.]/g, '')) || 0)} placeholder="0.00" />
          </div>
        </div>
        <div className="campo"><label htmlFor="comp">Pieza del Garage (opcional)</label>
          <select id="comp" className="entrada" value={componente} onChange={(e) => setComponente(e.target.value)}>
            <option value="">Ninguna</option>{COMPONENTES.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </select>
          <span className="ayuda-texto">Al terminar, la salud de la unidad se actualiza sola.</span>
        </div>
      </div>
      <Error texto={falta} />
      <div><button className="btn btn-sec" onClick={agregar}>Agregar línea</button></div>
    </div>
  )
}

function Cancelar({ alCancelar }: { alCancelar: (motivo: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [m, setM] = useState('')
  if (!abierto) return <button className="btn btn-sec" onClick={() => setAbierto(true)}>Cancelar orden</button>
  return (
    <div className="fila envolver" style={{ flex: '1 1 100%' }}>
      <input className="entrada" aria-label="Motivo de la cancelación" placeholder="Motivo (lo ve la empresa)" value={m} onChange={(e) => setM(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      <button className="btn" onClick={() => alCancelar(m)}>Confirmar cancelación</button>
      <button className="btn-texto" onClick={() => setAbierto(false)}>No cancelar</button>
    </div>
  )
}
