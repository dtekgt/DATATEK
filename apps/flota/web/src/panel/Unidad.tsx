// Ficha de la unidad para el taller: salud por pieza, pilotos, documentos, km reportado, inspecciones e historial de órdenes.
// Desde aquí se abre una orden, se anota una revisión, se agregan pilotos y documentos, y se da de baja. La base valida todo.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { BotonesSel, Chip, Contador, Fecha } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { dinero, fechaCorta, haceCuanto, hoyGT, km as fmtKm } from '@nucleo/formato'
import { COMPONENTES, ESTADOS, Flota, ITEMS_INSPECCION, type Ficha } from '../datos'
import { DOC, Error, TONO_PIEZA, textoVence, tonoVence } from '../comun'

const LICENCIAS = ['A', 'B', 'C', 'M', 'E'].map((v) => ({ valor: v, texto: v }))
const RESULTADOS = [{ valor: 'bien', texto: 'Bien' }, { valor: 'atencion', texto: 'Pide atención' }, { valor: 'cambiar', texto: 'Hay que cambiar' }, { valor: 'cambiado', texto: 'Se cambió' }]
export function UnidadPanel() {
  const { id } = useParams()
  const ficha = useCarga(() => Flota.ficha(id!), [id])
  const salud = useCarga(() => Flota.salud(id!), [id])
  const piezas = useCarga(() => Flota.piezas(id!), [id])
  const recargar = () => { ficha.recargar(); salud.recargar(); piezas.recargar() }
  const [verTodas, setVerTodas] = useState(false)
  const sinDatos = (piezas.datos || []).filter((p) => p.tono === 'sin_datos').length
  if (ficha.error) return <p className="error-texto">{ficha.error}</p>
  if (!ficha.datos) return <p className="cargando">Cargando la unidad…</p>
  const f = ficha.datos
  const u = f.unidad
  const s = salud.datos
  return (
    <>
      <div className="titulo-pagina">
        <div>
          <Link to="/panel/unidades" className="chico">‹ Unidades</Link>
          <h1>{u.placa} · {u.marca} {u.linea} {u.anio ?? ''}</h1>
          <span className="suave chico">{u.flota} · {fmtKm(u.km)} ({haceCuanto(u.km_reportado_en)}){u.vin ? ` · VIN ${u.vin}` : ''}</span>
        </div>
        <Chip tono={u.estado === 'taller' ? 'mal' : u.estado === 'baja' ? 'neutro' : 'bien'}>{u.estado === 'taller' ? 'En taller' : u.estado === 'baja' ? 'De baja' : 'Operando'}</Chip>
      </div>
      {u.estado === 'baja' && <div className="aviso-caja" style={{ marginBottom: 16 }}><b>Unidad de baja</b><span className="chico">{u.baja_motivo}</span></div>}
      <Error texto={salud.error || piezas.error} />
      <div className="grilla-2">
        <div className="columna" style={{ gap: 20 }}>
          {u.estado !== 'baja' && <NuevaOrden unidad={u.id} />}
          <section className="tarjeta" style={{ gap: 0 }}>
            <div className="fila-entre"><h2>Salud por pieza</h2>{s && <span className="suave chico">{s.conocidas} de {s.total} conocidas · {s.ahora} ahora · {s.cerca} cerca</span>}</div>
            {s?.proximo_nombre && <p className="chico" style={{ margin: '6px 0' }}><b>Lo próximo:</b> {s.proximo_nombre} · {s.proximo_detalle}</p>}
            <div className="lista-filas">
              {(piezas.datos || []).filter((p) => verTodas || p.tono !== 'sin_datos').map((p) => (
                <div key={p.componente} className="fila-dato"><div><div className="titulo">{p.nombre}</div><div className="sub">{p.detalle}</div></div><Chip tono={TONO_PIEZA[p.tono].tono}>{TONO_PIEZA[p.tono].texto}</Chip></div>
              ))}
            </div>
            {sinDatos > 0 && <button className="btn-texto" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setVerTodas((v) => !v)}>{verTodas ? 'Ocultar las piezas sin datos' : `Ver ${sinDatos} piezas sin datos`}</button>}
            {u.estado !== 'baja' && <AnotarPieza unidad={u.id} km={u.km} alGuardar={recargar} />}
          </section>
          <Historial f={f} />
          <Inspecciones f={f} />
        </div>
        <div className="columna" style={{ gap: 20 }}>
          <Pilotos f={f} alCambiar={recargar} />
          <Documentos f={f} alCambiar={recargar} />
          <section className="tarjeta" style={{ gap: 0 }}>
            <h2>Kilometraje reportado</h2>
            {f.km.length === 0 ? <p className="vacio">Nadie ha reportado km todavía.</p> : (
              <div className="lista-filas">
                {f.km.map((k, i) => (
                  <div key={i} className="fila-dato"><div><div className="titulo">{fmtKm(k.km)}</div><div className="sub">{k.quien || 'Taller'} · {fechaCorta(k.en)}</div></div>{k.rechazado && <Chip tono="mal">Menor al anterior</Chip>}</div>
                ))}
              </div>
            )}
          </section>
          <Baja f={f} alCambiar={recargar} />
        </div>
      </div>
    </>
  )
}

function NuevaOrden({ unidad }: { unidad: string }) {
  const { puede } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [prioridad, setPrioridad] = useState<'normal' | 'urgente'>('normal')
  const acc = useAccion()
  const nav = useNavigate()
  if (!puede('ver_ordenes')) return null
  if (!abierto) return <div><button className="btn" onClick={() => setAbierto(true)}>+ Orden para esta unidad</button></div>
  return (
    <section className="tarjeta">
      <h2>Nueva orden</h2>
      <div className="campo"><label htmlFor="motivo-u">Motivo (lo lee la empresa)</label><input id="motivo-u" className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Servicio de 150,000 km" /></div>
      <BotonesSel rotulo="Prioridad" valor={prioridad} alCambiar={setPrioridad} opciones={[{ valor: 'normal', texto: 'Normal' }, { valor: 'urgente', texto: 'Urgente', sub: 'unidad parada' }]} />
      <Error texto={acc.error} />
      <div className="fila envolver">
        <button className="btn" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
          if (motivo.trim().length < 3) throw new globalThis.Error('Escribí el motivo de la orden.')
          nav(`/panel/ordenes/${await Flota.crearOrden(unidad, motivo, prioridad, null)}`)
        })}>Crear orden</button>
        <button className="btn-texto" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </section>
  )
}

function AnotarPieza({ unidad, km, alGuardar }: { unidad: string; km: number; alGuardar: () => void }) {
  const { puede } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [componente, setComponente] = useState('')
  const [fecha, setFecha] = useState<string | null>(hoyGT())
  const [resultado, setResultado] = useState<string | null>(null)
  const [kmv, setKm] = useState(km)
  const acc = useAccion()
  if (!puede('registrar_trabajo')) return null
  if (!abierto) return <div style={{ paddingTop: 12 }}><button className="btn btn-sec btn-chico" onClick={() => setAbierto(true)}>Anotar una revisión</button></div>
  return (
    <div className="columna" style={{ borderTop: '1px solid var(--linea)', paddingTop: 12, marginTop: 8 }}>
      <strong>Anotar una revisión o cambio</strong>
      <div className="grilla-campos">
        <div className="campo"><label htmlFor="pieza">Pieza</label>
          <select id="pieza" className="entrada" value={componente} onChange={(e) => setComponente(e.target.value)}>
            <option value="">Elegí la pieza</option>{COMPONENTES.map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
          </select>
        </div>
        <Fecha rotulo="Cuándo" valor={fecha} alCambiar={setFecha} max={hoyGT()} atajos="pasado" />
        <Contador rotulo="Kilometraje" valor={kmv} paso={100} unidad="km" alCambiar={setKm} />
      </div>
      <BotonesSel rotulo="Cómo estaba" valor={resultado} alCambiar={setResultado} opciones={RESULTADOS} />
      <Error texto={acc.error} />
      <div className="fila envolver">
        <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
          if (!componente || !fecha || !resultado) throw new globalThis.Error('Elegí la pieza, el día y cómo estaba.')
          await Flota.anotarPieza(unidad, componente, fecha, kmv, resultado)
          setAbierto(false); setComponente(''); setResultado(null); alGuardar()
        })}>Guardar</button>
        <button className="btn-texto" onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
    </div>
  )
}

function Historial({ f }: { f: Ficha }) {
  const cerradas = f.ordenes.filter((o) => o.estado === 'entregada')
  const total = cerradas.reduce((s, o) => s + Number(o.total), 0)
  return (
    <section className="tarjeta" style={{ gap: 0 }}>
      <div className="fila-entre"><h2>Historial de órdenes</h2>{cerradas.length > 0 && <span className="suave chico">{cerradas.length} entregadas · {dinero(total)}</span>}</div>
      {f.ordenes.length === 0 ? <p className="vacio">Esta unidad no ha tenido órdenes.</p> : (
        <div className="lista-filas">
          {f.ordenes.map((o) => (
            <Link key={o.id} to={`/panel/ordenes/${o.id}`} className="fila-dato">
              <div><div className="titulo">Orden {o.numero} · {o.motivo}</div><div className="sub">{fechaCorta(o.creada_en)} · {dinero(o.total)}</div></div>
              <Chip tono={ESTADOS[o.estado].tono}>{ESTADOS[o.estado].texto}</Chip>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function Inspecciones({ f }: { f: Ficha }) {
  return (
    <section className="tarjeta" style={{ gap: 0 }}>
      <h2>Inspecciones de salida</h2>
      {f.inspecciones.length === 0 ? <p className="vacio">El piloto todavía no ha hecho inspecciones.</p> : (
        <div className="lista-filas">
          {f.inspecciones.map((i, n) => {
            const mal = ITEMS_INSPECCION.filter((x) => i.items[x.clave] === false).map((x) => x.texto.toLowerCase())
            return (
              <div key={n} className="fila-dato">
                <div><div className="titulo">{i.quien || 'Piloto'} · {fechaCorta(i.en)}</div><div className="sub">{mal.length ? `Revisar: ${mal.join(', ')}` : 'Todo bien'}{i.km ? ` · ${fmtKm(i.km)}` : ''}{i.nota ? ` · ${i.nota}` : ''}</div></div>
                <Chip tono={i.todo_bien ? 'bien' : 'mal'}>{i.todo_bien ? 'Bien' : 'Con falla'}</Chip>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function Pilotos({ f, alCambiar }: { f: Ficha; alCambiar: () => void }) {
  const { puede } = useSesion()
  const [alta, setAlta] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const edita = puede('ver_clientes') && f.unidad.estado !== 'baja'
  return (
    <section className="tarjeta" style={{ gap: 0 }}>
      <div className="fila-entre"><h2>Pilotos</h2>{edita && !alta && <button className="btn btn-sec btn-chico" onClick={() => setAlta(true)}>+ Piloto</button>}</div>
      {f.pilotos.length === 0 && !alta && <p className="vacio">Sin piloto asignado. Sin piloto, nadie reporta el km de esta unidad.</p>}
      <div className="lista-filas">
        {f.pilotos.map((p) => (
          <div key={p.id} className="columna" style={{ gap: 6, padding: '10px 0' }}>
            <div className="fila-dato" style={{ padding: 0 }}>
              <div><div className="titulo">{p.nombre}</div><div className="sub">{p.telefono || 'Sin teléfono'} · {p.ligado ? 'ya entra con su teléfono' : 'todavía no entra'}</div>
                <div className="sub">Licencia {p.licencia_tipo || '—'} · {textoVence(p.licencia_vence)}</div></div>
              {edita && editando !== p.id && <button className="btn-texto" onClick={() => setEditando(p.id)}>Cambiar</button>}
            </div>
            {editando === p.id && <EditarPiloto f={f} p={p} alTerminar={() => { setEditando(null); alCambiar() }} alCancelar={() => setEditando(null)} />}
          </div>
        ))}
      </div>
      {alta && <AltaPiloto f={f} alTerminar={() => { setAlta(false); alCambiar() }} alCancelar={() => setAlta(false)} />}
    </section>
  )
}

function AltaPiloto({ f, alTerminar, alCancelar }: { f: Ficha; alTerminar: () => void; alCancelar: () => void }) {
  const sueltos = useCarga(() => Flota.pilotos(f.unidad.flota_id), [f.unidad.flota_id])
  const libres = (sueltos.datos || []).filter((p) => !p.unidad_id)
  const [existente, setExistente] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [tel, setTel] = useState('')
  const [lic, setLic] = useState<string | null>('B')
  const [vence, setVence] = useState<string | null>(null)
  const acc = useAccion()
  return (
    <div className="columna" style={{ borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
      <strong>Agregar piloto a {f.unidad.placa}</strong>
      {libres.length > 0 && <BotonesSel rotulo="Piloto de la flota sin unidad" valor={existente} alCambiar={(v) => setExistente(v === existente ? null : v)} opciones={libres.map((p) => ({ valor: p.id, texto: p.nombre, sub: `Licencia ${p.licencia_tipo || '—'}` }))} />}
      {!existente && (
        <>
          <div className="grilla-campos">
            <div className="campo"><label htmlFor="pnombre">Nombre</label><input id="pnombre" className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Luis Ramírez" /></div>
            <div className="campo"><label htmlFor="ptel">Teléfono</label><input id="ptel" className="entrada" inputMode="numeric" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="5555 0000" /><span className="ayuda-texto">Con este número entra a reportar km y hacer la inspección.</span></div>
          </div>
          <BotonesSel rotulo="Licencia" valor={lic} alCambiar={setLic} opciones={LICENCIAS} />
          <Fecha rotulo="Licencia vence" valor={vence} alCambiar={setVence} conAnio />
        </>
      )}
      <Error texto={acc.error} />
      <div className="fila envolver">
        <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
          if (existente) {
            const p = libres.find((x) => x.id === existente)!
            await Flota.editarPiloto(p.id, f.unidad.id, p.licencia_tipo, p.licencia_vence, true)
          } else {
            if (nombre.trim().length < 3) throw new globalThis.Error('Escribí el nombre del piloto.')
            await Flota.agregarPiloto(f.unidad.flota_id, nombre, tel || null, f.unidad.id, lic, vence)
          }
          alTerminar()
        })}>{existente ? 'Asignar a esta unidad' : 'Agregar piloto'}</button>
        <button className="btn-texto" onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function EditarPiloto({ f, p, alTerminar, alCancelar }: { f: Ficha; p: Ficha['pilotos'][number]; alTerminar: () => void; alCancelar: () => void }) {
  const unidades = useCarga(() => Flota.unidades(f.unidad.flota_id), [f.unidad.flota_id])
  const [unidad, setUnidad] = useState<string>(f.unidad.id)
  const [lic, setLic] = useState<string | null>(p.licencia_tipo)
  const [vence, setVence] = useState<string | null>(p.licencia_vence)
  const acc = useAccion()
  return (
    <div className="columna" style={{ background: 'var(--fondo)', borderRadius: 12, padding: 12 }}>
      <BotonesSel rotulo="Unidad" valor={unidad} alCambiar={setUnidad} opciones={[...(unidades.datos || []).map((x) => ({ valor: x.id, texto: x.placa })), { valor: 'ninguna', texto: 'Sin unidad' }]} />
      <BotonesSel rotulo="Licencia" valor={lic} alCambiar={setLic} opciones={LICENCIAS} />
      <Fecha rotulo="Licencia vence" valor={vence} alCambiar={setVence} conAnio />
      <Error texto={acc.error} />
      <div className="fila envolver">
        <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.editarPiloto(p.id, unidad === 'ninguna' ? null : unidad, lic, vence, true); alTerminar() })}>Guardar</button>
        <button className="btn btn-chico btn-sec" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.editarPiloto(p.id, null, lic, vence, false); alTerminar() })}>Ya no trabaja con la empresa</button>
        <button className="btn-texto" onClick={alCancelar}>Cancelar</button>
      </div>
    </div>
  )
}

function Documentos({ f, alCambiar }: { f: Ficha; alCambiar: () => void }) {
  const { puede } = useSesion()
  const [alta, setAlta] = useState(false)
  const [tipo, setTipo] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [vence, setVence] = useState<string | null>(null)
  const acc = useAccion()
  const edita = puede('ver_clientes') && f.unidad.estado !== 'baja'
  return (
    <section className="tarjeta" style={{ gap: 0 }}>
      <div className="fila-entre"><h2>Documentos</h2>{edita && !alta && <button className="btn btn-sec btn-chico" onClick={() => setAlta(true)}>+ Documento</button>}</div>
      {f.documentos.length === 0 && !alta && <p className="vacio">Sin documentos. Agregá el seguro y la tarjeta para avisar antes de que venzan.</p>}
      <div className="lista-filas">
        {f.documentos.map((d) => (
          <div key={d.id} className="fila-dato"><div><div className="titulo">{DOC[d.tipo] || d.tipo}</div><div className="sub">{d.numero || 'Sin número'} · {fechaCorta(d.vence)}</div></div><Chip tono={tonoVence(d.vence)}>{textoVence(d.vence)}</Chip></div>
        ))}
      </div>
      {alta && (
        <div className="columna" style={{ borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
          <BotonesSel rotulo="Documento" valor={tipo} alCambiar={setTipo} opciones={[{ valor: 'seguro', texto: 'Seguro' }, { valor: 'tarjeta_circulacion', texto: 'Tarjeta de circulación' }, { valor: 'otro', texto: 'Otro' }]} />
          <div className="campo"><label htmlFor="docnum">Número (póliza, tarjeta)</label><input id="docnum" className="entrada" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="POL-12345" /></div>
          <Fecha rotulo="Vence" valor={vence} alCambiar={setVence} conAnio />
          <span className="ayuda-texto">Si ya había uno del mismo tipo, este lo reemplaza. Queda en el calendario el día que vence.</span>
          <Error texto={acc.error} />
          <div className="fila envolver">
            <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
              if (!tipo || !vence) throw new globalThis.Error('Elegí el documento y el día que vence.')
              await Flota.documento(f.unidad.id, tipo, numero.trim() || null, vence)
              setAlta(false); setTipo(null); setNumero(''); setVence(null); alCambiar()
            })}>Guardar documento</button>
            <button className="btn-texto" onClick={() => setAlta(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function Baja({ f, alCambiar }: { f: Ficha; alCambiar: () => void }) {
  const { puede } = useSesion()
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const acc = useAccion()
  if (!puede('ver_clientes')) return null
  if (f.unidad.estado === 'baja') return (
    <section className="tarjeta"><Error texto={acc.error} /><button className="btn btn-sec" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.unidadBaja(f.unidad.id, false, null); alCambiar() })}>Reactivar la unidad</button></section>
  )
  return (
    <section className="tarjeta">
      {!abierto ? <button className="btn-texto" style={{ alignSelf: 'flex-start' }} onClick={() => setAbierto(true)}>Dar de baja esta unidad</button> : (
        <>
          <strong>Dar de baja {f.unidad.placa}</strong>
          <span className="chico">Sale de las listas y del panel; su historial se queda. Sus pilotos quedan sin unidad.</span>
          <input className="entrada" aria-label="Motivo de la baja" placeholder="Vendida, chocada, devuelta…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Error texto={acc.error} />
          <div className="fila envolver">
            <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.unidadBaja(f.unidad.id, true, motivo); setAbierto(false); alCambiar() })}>Confirmar baja</button>
            <button className="btn-texto" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </>
      )}
    </section>
  )
}
