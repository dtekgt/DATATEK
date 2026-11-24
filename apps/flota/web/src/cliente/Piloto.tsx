// Pantalla del piloto (N-03): la inspección antes de salir con el km del tablero, lo próximo de su unidad y cuándo vencen
// sus documentos, actualizar el km durante el día y avisar una falla con botones para lo más común.
import { useState } from 'react'
import { useSesion } from '@nucleo/acceso/Sesion'
import { BotonesSel, Contador } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { haceCuanto, hora, km as fmtKm } from '@nucleo/formato'
import { Flota, ITEMS_INSPECCION } from '../datos'
import { DOC, Error, textoVence, tonoVence } from '../comun'

const COMUNES = ['Se encendió una luz en el tablero', 'Ruido al frenar', 'Llanta baja o dañada', 'No arranca o le cuesta', 'Otra cosa']
const COLOR = { mal: 'var(--mal-texto)', aviso: 'var(--aviso-texto)', bien: 'var(--tinta)', neutro: 'var(--tinta-2)' }

export function Piloto() {
  const { negocio, salir } = useSesion()
  const { datos: u, error, recargar } = useCarga(() => Flota.miUnidad(negocio!.negocio_id), [negocio!.negocio_id])
  const resumen = useCarga(() => (u ? Flota.resumenPiloto(u.unidad_id) : Promise.resolve(null)), [u?.unidad_id])
  const [hecho, setHecho] = useState('')
  if (error) return <p className="error-texto">{error}</p>
  if (!u) return <p className="cargando">Cargando tu unidad…</p>
  const r = resumen.datos
  const alGuardar = (texto: string) => { setHecho(texto); recargar(); resumen.recargar() }
  return (
    <>
      <section className="tarjeta" style={{ gap: 4 }}>
        <h1 style={{ fontSize: 20 }}>{u.placa} · {u.marca} {u.linea} {u.anio ?? ''}</h1>
        <span className="suave">{u.flota} · último km {fmtKm(u.km_actual)} ({haceCuanto(u.km_reportado_en)})</span>
      </section>
      {hecho && <p role="status" className="chico" style={{ margin: 0, color: 'var(--bien-texto)', fontWeight: 600 }}>✓ {hecho}</p>}
      {r && (r.inspeccion_hoy
        ? <section className="tarjeta" style={{ gap: 2 }}><b>{r.inspeccion_hoy.todo_bien ? '✓ Inspección de hoy hecha' : 'Inspección de hoy: le avisamos al taller'}</b><span className="suave chico">a las {hora(r.inspeccion_hoy.en)}</span></section>
        : <Inspeccion unidad={u.unidad_id} km={u.km_actual} alGuardar={alGuardar} />)}
      {r && (
        <section className="tarjeta" style={{ gap: 6 }}>
          <h2>Tu unidad</h2>
          <div className="fila-dato" style={{ padding: 0 }}><span className="suave chico">Próximo servicio</span><b style={{ color: r.proximo_tono === 'vencido' ? COLOR.mal : COLOR.bien, textAlign: 'right' }}>{r.proximo || (r.conocidas ? 'Todo al día' : 'El taller todavía no la revisó')}</b></div>
          {r.documentos.map((d) => <div key={d.tipo} className="fila-dato" style={{ padding: 0 }}><span className="suave chico">{DOC[d.tipo] || d.tipo}</span><b style={{ color: COLOR[tonoVence(d.vence)] }}>{textoVence(d.vence)}</b></div>)}
          {r.licencia_vence && <div className="fila-dato" style={{ padding: 0 }}><span className="suave chico">Tu licencia</span><b style={{ color: COLOR[tonoVence(r.licencia_vence)] }}>{textoVence(r.licencia_vence)}</b></div>}
        </section>
      )}
      {r?.inspeccion_hoy && <Kilometraje unidad={u.unidad_id} actual={u.km_actual} alGuardar={alGuardar} />}
      <Falla unidad={u.unidad_id} alGuardar={alGuardar} />
      <button className="btn btn-sec" onClick={salir}>Salir</button>
    </>
  )
}

function Inspeccion({ unidad, km, alGuardar }: { unidad: string; km: number; alGuardar: (t: string) => void }) {
  const [items, setItems] = useState<Record<string, 'bien' | 'mal'>>({})
  const [kmv, setKm] = useState(km)
  const [nota, setNota] = useState('')
  const acc = useAccion()
  const completos = ITEMS_INSPECCION.every((i) => items[i.clave])
  const malos = ITEMS_INSPECCION.filter((i) => items[i.clave] === 'mal')
  return (
    <section className="tarjeta">
      <h2>Antes de salir</h2>
      <span className="suave chico">Revisá cada cosa y marcá cómo está.</span>
      {ITEMS_INSPECCION.map((i) => (
        <BotonesSel key={i.clave} rotulo={i.texto} valor={items[i.clave] ?? null} alCambiar={(v) => setItems((x) => ({ ...x, [i.clave]: v }))}
          opciones={[{ valor: 'bien', texto: 'Bien' }, { valor: 'mal', texto: 'Revisar' }]} />
      ))}
      <Contador rotulo="Kilometraje del tablero" valor={kmv} paso={10} min={0} unidad="km" alCambiar={setKm} sub={`Último: ${fmtKm(km)}`} />
      {malos.length > 0 && <div className="campo"><label htmlFor="nota">Contale al taller qué viste</label><textarea id="nota" className="entrada" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="La llanta trasera izquierda se ve baja" /></div>}
      <Error texto={acc.error} />
      <button className="btn" disabled={acc.ocupado || !completos} onClick={() => acc.correr(async () => {
        const r = await Flota.inspeccion(unidad, Object.fromEntries(ITEMS_INSPECCION.map((i) => [i.clave, items[i.clave] === 'bien'])), kmv === km ? null : kmv, nota.trim() || null)
        alGuardar([r.todo_bien ? 'Inspección guardada. Buen viaje.' : 'Inspección guardada. Le avisamos al taller lo que hay que revisar.',
          r.km === 'menor_al_anterior' ? 'El km es menor al último y el taller lo va a revisar.' : ''].filter(Boolean).join(' '))
      })}>{!completos ? 'Marcá las cinco para seguir' : malos.length ? 'Avisar al taller y guardar' : 'Listo para salir'}</button>
    </section>
  )
}

function Kilometraje({ unidad, actual, alGuardar }: { unidad: string; actual: number; alGuardar: (t: string) => void }) {
  const [km, setKm] = useState<number | null>(null)
  const acc = useAccion()
  const valor = km ?? actual
  return (
    <section className="tarjeta">
      <h2>¿Cuánto marca ahora?</h2>
      <Contador rotulo="Kilometraje" valor={valor} paso={10} min={0} unidad="km" alCambiar={setKm} sub="Tocá + o − o escribí el número del tablero." />
      <Error texto={acc.error} />
      <button className="btn" disabled={acc.ocupado || valor === actual} onClick={() => acc.correr(async () => {
        const r = await Flota.reportarKm(unidad, valor)
        if (r === 'menor_al_anterior') throw new globalThis.Error('Ese número es menor al último. Revisá el tablero.')
        setKm(null); alGuardar('Kilometraje guardado. Gracias.')
      })}>Guardar kilometraje</button>
    </section>
  )
}

function Falla({ unidad, alGuardar }: { unidad: string; alGuardar: (t: string) => void }) {
  const [tipo, setTipo] = useState<string | null>(null)
  const [detalle, setDetalle] = useState('')
  const acc = useAccion()
  return (
    <section className="tarjeta">
      <h2>Avisar una falla</h2>
      <BotonesSel valor={tipo} alCambiar={(v) => { setTipo(v); setDetalle(v !== 'Otra cosa' ? v : '') }} opciones={COMUNES.map((c) => ({ valor: c, texto: c }))} />
      {tipo && <div className="campo"><label htmlFor="detalle">Contale al taller qué pasa</label><textarea id="detalle" className="entrada" value={detalle} onChange={(e) => setDetalle(e.target.value)} /></div>}
      <Error texto={acc.error} />
      {tipo && <button className="btn" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.reportarFalla(unidad, detalle); setTipo(null); setDetalle(''); alGuardar('Le avisamos al taller. Te van a llamar.') })}>Avisar al taller</button>}
    </section>
  )
}
