// Garage de la unidad (maqueta Flota-C2): kilometraje que se toca para actualizar, lo próximo con botón para pedir el
// servicio, salud por pieza, documentos con su vencimiento y el historial de órdenes de esa unidad.
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Chip, Contador } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { dinero, fechaCorta, haceCuanto, km as fmtKm } from '@nucleo/formato'
import { ESTADOS, Flota } from '../datos'
import { DOC, Error, TONO_PIEZA, textoVence, tonoVence } from '../comun'

export function UnidadCliente() {
  const { id } = useParams()
  const ficha = useCarga(() => Flota.ficha(id!), [id])
  const salud = useCarga(() => Flota.salud(id!), [id])
  const piezas = useCarga(() => Flota.piezas(id!), [id])
  const [km, setKm] = useState<number | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [que, setQue] = useState('')
  const acc = useAccion()
  const accPedir = useAccion()
  const f = ficha.datos
  const u = f?.unidad
  const s = salud.datos
  const atencion = (piezas.datos || []).filter((p) => p.tono === 'vencido' || p.tono === 'proximo')
  const recargar = () => { ficha.recargar(); salud.recargar(); piezas.recargar() }
  return (
    <>
      <Link to="/mi" className="chico">‹ Mi flota</Link>
      <Error texto={ficha.error || salud.error || piezas.error} />
      {f && u && (
        <section className="tarjeta" style={{ gap: 6 }}>
          <div className="fila-entre"><h1 style={{ fontSize: 20 }}>{u.placa} · {u.marca} {u.linea} {u.anio ?? ''}</h1><Chip tono={u.estado === 'taller' ? 'mal' : 'bien'}>{u.estado === 'taller' ? 'En el taller' : 'Operando'}</Chip></div>
          {f.pilotos.length > 0 && <span className="suave chico">Piloto: {f.pilotos.map((p) => p.nombre).join(', ')}</span>}
          {km === null ? (
            <button className="entrada" style={{ alignSelf: 'flex-start', width: 'auto', textAlign: 'left', borderStyle: 'dashed', borderColor: '#93C5FD', background: 'var(--acento-suave)', cursor: 'pointer' }} onClick={() => setKm(u.km)}>
              <b style={{ fontSize: 15 }}>{fmtKm(u.km)}</b> <span className="suave chico">· {haceCuanto(u.km_reportado_en)} · tocá para actualizar</span>
            </button>
          ) : (
            <div className="columna">
              <Contador rotulo="Kilometraje de hoy" valor={km} paso={100} unidad="km" min={0} alCambiar={setKm} sub={`Último: ${fmtKm(u.km)}`} />
              <div className="fila">
                <button className="btn" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
                  const r = await Flota.reportarKm(id!, km)
                  if (r === 'menor_al_anterior') throw new globalThis.Error('Ese kilometraje es menor al último registrado. Revisalo.')
                  setKm(null); recargar()
                })}>Guardar</button>
                <button className="btn-texto" onClick={() => setKm(null)}>Cancelar</button>
              </div>
            </div>
          )}
          <Error texto={acc.error} />
        </section>
      )}
      {s && f && u && (
        <section className={s.ahora > 0 ? 'aviso-caja' : 'tarjeta'}>
          <span className="etiqueta" style={{ color: s.ahora > 0 ? 'var(--aviso-texto)' : 'var(--tinta-2)' }}>Lo próximo</span>
          <strong style={{ fontSize: 17 }}>{s.proximo_nombre || (s.conocidas === 0 ? 'Sin historial todavía' : 'Todo al día')}</strong>
          {s.proximo_detalle && <span className="chico">{s.proximo_detalle}</span>}
          <div className="fila chico envolver" style={{ gap: 14 }}><span><b>{s.ahora}</b> ahora</span><span><b>{s.cerca}</b> cerca</span><span><b>{s.conocidas}</b> de {s.total} piezas revisadas</span></div>
          {!s.km_reciente && <span className="chico" style={{ fontWeight: 600 }}>Sin kilometraje en las últimas 2 semanas: las fechas son estimadas.</span>}
          {f.solicitud_abierta
            ? <span className="chico" role="status" style={{ color: 'var(--bien-texto)', fontWeight: 600 }}>✓ Ya le pediste al taller: {f.solicitud_abierta.replace(`${u.placa} · `, '')}. Te van a contactar para agendar.</span>
            : f.puedo_pedir && u.estado !== 'taller' && !pidiendo && (
              <button className="btn" onClick={() => { setQue(s.proximo_nombre || ''); setPidiendo(true) }}>{s.proximo_nombre ? `Pedir ${s.proximo_nombre.toLowerCase()}` : s.conocidas === 0 ? 'Pedir una revisión' : 'Pedir un servicio'}</button>
            )}
          {pidiendo && !f.solicitud_abierta && (
            <div className="columna">
              <div className="campo"><label htmlFor="que">Qué le pedís al taller</label><input id="que" className="entrada" value={que} onChange={(e) => setQue(e.target.value)} placeholder="Revisión general" /></div>
              <Error texto={accPedir.error} />
              <div className="fila envolver">
                <button className="btn" disabled={accPedir.ocupado} onClick={() => accPedir.correr(async () => { await Flota.solicitarServicio(id!, que.trim() || 'Revisión general'); setPidiendo(false); ficha.recargar() })}>Mandar al taller</button>
                <button className="btn-texto" onClick={() => setPidiendo(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </section>
      )}
      {atencion.length > 0 && (
        <section className="tarjeta" style={{ gap: 0 }}>
          <h2>Pide atención</h2>
          <div className="lista-filas">
            {atencion.map((p) => <div key={p.componente} className="fila-dato"><div><div className="titulo">{p.nombre}</div><div className="sub">{p.grupo} · {p.detalle}</div></div><Chip tono={TONO_PIEZA[p.tono].tono}>{TONO_PIEZA[p.tono].texto}</Chip></div>)}
          </div>
        </section>
      )}
      {f && f.documentos.length > 0 && (
        <section className="tarjeta" style={{ gap: 0 }}>
          <h2>Documentos</h2>
          <div className="lista-filas">
            {f.documentos.map((d) => <div key={d.id} className="fila-dato"><div><div className="titulo">{DOC[d.tipo] || d.tipo}</div><div className="sub">{d.numero || 'Sin número'} · {fechaCorta(d.vence)}</div></div><Chip tono={tonoVence(d.vence)}>{textoVence(d.vence)}</Chip></div>)}
          </div>
        </section>
      )}
      <section className="tarjeta" style={{ gap: 0 }}>
        <h2>Todas las piezas</h2>
        <div className="lista-filas">
          {(piezas.datos || []).map((p) => <div key={p.componente} className="fila-dato"><div><div className="titulo">{p.nombre}</div><div className="sub">{p.realizado_en ? `Última vez ${haceCuanto(p.realizado_en)}` : 'Sin registro'}</div></div><Chip tono={TONO_PIEZA[p.tono].tono}>{TONO_PIEZA[p.tono].texto}</Chip></div>)}
        </div>
      </section>
      {f && f.ordenes.length > 0 && (
        <section className="tarjeta" style={{ gap: 0 }}>
          <h2>Historial</h2>
          <div className="lista-filas">
            {f.ordenes.map((o) => (
              <Link key={o.id} to={`/mi/orden/${o.id}`} className="fila-dato">
                <div><div className="titulo">{o.motivo}</div><div className="sub">Orden {o.numero} · {fechaCorta(o.creada_en)} · {dinero(o.total)}</div></div>
                <Chip tono={ESTADOS[o.estado].tono}>{ESTADOS[o.estado].cliente}</Chip>
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className="suave chico" style={{ margin: 0 }}>Las fechas y el kilometraje son estimados; el estado real de una pieza solo cambia cuando el taller la revisa.</p>
    </>
  )
}
