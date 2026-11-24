// Calendario del mes: servicios, documentos que vencen y fallas. Mover un evento pide confirmación antes de avisar (D14).
// Agendar una visita al patio con varias unidades (un evento por unidad) y abrir sus órdenes el día que llega el mecánico.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { BotonesSel, Fecha, textoFecha, useAvisoDeshacer } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { hoyGT, hora } from '@nucleo/formato'
import { Flota, type Evento } from '../datos'
import { Error } from '../comun'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const diaGT = (v: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date(v))

export function Calendario() {
  const { negocio, puede } = useSesion()
  const neg = negocio!.negocio_id
  const hoy = hoyGT()
  const [mes, setMes] = useState({ a: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) - 1 })
  const desde = `${mes.a}-${String(mes.m + 1).padStart(2, '0')}-01`
  const hasta = new Date(mes.a, mes.m + 1, 0).toISOString().slice(0, 10)
  const { datos, error, recargar } = useCarga(() => Flota.eventos(neg, desde, hasta), [neg, desde])
  const [sel, setSel] = useState(hoy)
  const [agendando, setAgendando] = useState(false)
  const porDia = useMemo(() => { const m = new Map<string, Evento[]>(); for (const e of datos || []) { const d = diaGT(e.programada_para); m.set(d, [...(m.get(d) || []), e]) } return m }, [datos])
  const vacias = (new Date(mes.a, mes.m, 1).getDay() + 6) % 7
  const dias = new Date(mes.a, mes.m + 1, 0).getDate()
  return (
    <>
      <div className="titulo-pagina">
        <div className="fila">
          <button className="btn btn-sec btn-chico" aria-label="Mes anterior" onClick={() => setMes(({ a, m }) => (m === 0 ? { a: a - 1, m: 11 } : { a, m: m - 1 }))}>‹</button>
          <h1>{MESES[mes.m]} {mes.a}</h1>
          <button className="btn btn-sec btn-chico" aria-label="Mes siguiente" onClick={() => setMes(({ a, m }) => (m === 11 ? { a: a + 1, m: 0 } : { a, m: m + 1 }))}>›</button>
        </div>
        {puede('mover_calendario') && <button className="btn" onClick={() => setAgendando((v) => !v)}>{agendando ? 'Cerrar' : 'Agendar visita'}</button>}
      </div>
      <Error texto={error} />
      {agendando && <AgendarVisita negocio={neg} dia={sel >= hoy ? sel : hoy} alAgendar={(d) => { setAgendando(false); setSel(d); recargar() }} />}
      <div className="grilla-2">
        <section className="tarjeta">
          <div className="cal-grilla" style={{ gap: 4 }}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <span key={d} className="dia-sem">{d}</span>)}
            {Array.from({ length: vacias }, (_, i) => <span key={'v' + i} />)}
            {Array.from({ length: dias }, (_, i) => {
              const d = `${desde.slice(0, 8)}${String(i + 1).padStart(2, '0')}`
              const ev = porDia.get(d) || []
              return (
                <button key={d} type="button" aria-pressed={sel === d} aria-label={`${textoFecha(d)}: ${ev.length} eventos`} onClick={() => setSel(d)}
                  style={{ height: 86, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, padding: 5, textAlign: 'left', border: sel === d ? '1.5px solid var(--acento)' : '1px solid #EEEDEA', background: sel === d ? 'var(--acento-suave)' : '#fff', color: 'inherit', overflow: 'hidden' }}>
                  <span style={{ fontWeight: 700, fontSize: 12, alignSelf: 'flex-start', ...(d === hoy ? { background: 'var(--acento)', color: '#fff', borderRadius: 11, padding: '1px 6px' } : {}) }}>{i + 1}</span>
                  {ev.slice(0, 2).map((e) => <span key={e.id} style={{ fontSize: 11, fontWeight: 600, background: e.tipo === 'documento' ? 'var(--mal-fondo)' : 'var(--aviso-fondo)', color: e.tipo === 'documento' ? 'var(--mal-texto)' : 'var(--aviso-texto)', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titulo}</span>)}
                  {ev.length > 2 && <span className="chico suave">+{ev.length - 2} más</span>}
                </button>
              )
            })}
          </div>
        </section>
        <DiaDetalle dia={sel} eventos={porDia.get(sel) || []} puedeMover={puede('mover_calendario')} alMover={recargar} />
      </div>
    </>
  )
}

const FRANJAS = [{ valor: '07', texto: '7–9' }, { valor: '09', texto: '9–11' }, { valor: '11', texto: '11–13' }, { valor: '14', texto: '14–16' }]

function AgendarVisita({ negocio, dia, alAgendar }: { negocio: string; dia: string; alAgendar: (dia: string) => void }) {
  const flotas = useCarga(() => Flota.flotas(negocio), [negocio])
  const [flota, setFlota] = useState<string | null>(null)
  const actual = flota || flotas.datos?.[0]?.id || null
  const unidades = useCarga(() => (actual ? Flota.unidades(actual) : Promise.resolve([])), [actual])
  const [elegidas, setElegidas] = useState<string[]>([])
  const [fecha, setFecha] = useState<string | null>(dia)
  const [franja, setFranja] = useState<string | null>('07')
  const [motivo, setMotivo] = useState('Servicio en el patio')
  const acc = useAccion()
  const lista = unidades.datos || []
  const atencion = lista.filter((u) => u.estado !== 'taller' && (u.ahora > 0 || u.cerca > 0))
  const cambiar = (id: string) => setElegidas((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]))
  return (
    <section className="tarjeta" style={{ marginBottom: 16 }}>
      <h2>Visita al patio</h2>
      <span className="suave chico">Una visita con varias unidades: cada una queda en el calendario y el día de la visita se abre como orden.</span>
      {(flotas.datos?.length ?? 0) > 1 && <BotonesSel rotulo="Flota" valor={actual} alCambiar={(v) => { setFlota(v); setElegidas([]) }} opciones={(flotas.datos || []).map((f) => ({ valor: f.id, texto: f.nombre }))} />}
      <div className="campo">
        <div className="fila-entre envolver"><span className="rotulo">Unidades ({elegidas.length})</span>
          {atencion.length > 0 && <button type="button" className="btn-texto" onClick={() => setElegidas(atencion.map((u) => u.id))}>Elegir las {atencion.length} que piden atención</button>}</div>
        <div className="filtros">
          {lista.map((u) => <button key={u.id} type="button" className="filtro" aria-pressed={elegidas.includes(u.id)} onClick={() => cambiar(u.id)}>{u.placa}{u.ahora > 0 || u.cerca > 0 ? ' •' : ''}</button>)}
        </div>
      </div>
      <div className="grilla-campos">
        <Fecha rotulo="Día" valor={fecha} alCambiar={setFecha} min={hoyGT()} />
        <BotonesSel rotulo="Franja" valor={franja} alCambiar={setFranja} opciones={FRANJAS} />
      </div>
      <div className="campo"><label htmlFor="vmotivo">Qué se va a hacer (lo lee la empresa)</label><input id="vmotivo" className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
      <Error texto={acc.error || unidades.error} />
      <div><button className="btn" disabled={acc.ocupado} onClick={() => acc.correr(async () => {
        if (!actual || !elegidas.length) throw new globalThis.Error('Elegí al menos una unidad.')
        if (!fecha || !franja) throw new globalThis.Error('Elegí el día y la franja.')
        await Flota.agendarVisita(actual, elegidas, `${fecha}T${franja}:00:00-06:00`, motivo)
        alAgendar(fecha)
      })}>Agendar {elegidas.length || ''} {elegidas.length === 1 ? 'unidad' : 'unidades'}</button></div>
    </section>
  )
}

const ABRE_ORDEN = ['servicio', 'falla', 'solicitud']

function DiaDetalle({ dia, eventos, puedeMover, alMover }: { dia: string; eventos: Evento[]; puedeMover: boolean; alMover: () => void }) {
  const { puede } = useSesion()
  const nav = useNavigate()
  const accOrden = useAccion()
  const abribles = puede('ver_ordenes') ? eventos.filter((e) => e.objeto === 'unidad' && e.estado === 'programado' && ABRE_ORDEN.includes(e.tipo)) : []
  const abrir = (lista: Evento[]) => accOrden.correr(async () => {
    let ultima: string | null = null
    for (const e of lista) ultima = await Flota.atenderAviso(e.id, true)
    if (lista.length === 1 && ultima) nav(`/panel/ordenes/${ultima}`); else nav('/panel/ordenes')
  })
  const [moviendo, setMoviendo] = useState<Evento | null>(null)
  const [nueva, setNueva] = useState<string | null>(null)
  const acc = useAccion()
  const aviso = useAvisoDeshacer()
  const confirmar = (avisar: boolean) => moviendo && nueva && acc.correr(async () => {
    const original = moviendo.programada_para
    const hhmm = new Date(original).toLocaleTimeString('en-GB', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' })
    await Flota.moverEvento(moviendo.id, `${nueva}T${hhmm}:00-06:00`, avisar)
    const ev = moviendo
    setMoviendo(null); setNueva(null); alMover()
    aviso.mostrar(avisar ? 'Movido. Se avisó al cliente.' : 'Movido sin avisar.', avisar ? undefined : () => Flota.moverEvento(ev.id, original, false).then(alMover))
  })
  return (
    <section className="tarjeta">
      <h2 style={{ textTransform: 'capitalize' }}>{textoFecha(dia)}</h2>
      {eventos.length === 0 ? <p className="vacio">Nada este día.</p> : (
        <div className="lista-filas">
          {eventos.map((e) => (
            <div key={e.id} className="fila-dato">
              <div><div className="titulo">{e.titulo}</div><div className="sub">{hora(e.programada_para)} · {e.tipo}{e.estado === 'hecho' ? ' · orden abierta' : ''}</div></div>
              <div className="fila envolver" style={{ justifyContent: 'flex-end' }}>
                {abribles.includes(e) && <button className="btn btn-chico" disabled={accOrden.ocupado} onClick={() => abrir([e])}>Abrir orden</button>}
                {puedeMover && e.estado === 'programado' && <button className="btn-texto" onClick={() => { setMoviendo(e); setNueva(null) }}>Mover</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {abribles.length > 1 && <button className="btn btn-sec" disabled={accOrden.ocupado} onClick={() => abrir(abribles)}>Abrir las {abribles.length} órdenes de este día</button>}
      <Error texto={accOrden.error} />
      {moviendo && (
        <div className="columna" style={{ borderTop: '1px solid var(--linea)', paddingTop: 12 }}>
          <strong>Mover «{moviendo.titulo}»</strong>
          <Fecha rotulo="Nuevo día" valor={nueva} alCambiar={setNueva} min={hoyGT()} />
          {nueva && (
            <>
              <p className="chico" style={{ margin: 0 }}>Mensaje que recibe el cliente: «Movimos tu {moviendo.titulo} al {textoFecha(nueva)}».</p>
              <div className="fila envolver">
                <button className="btn" disabled={acc.ocupado} onClick={() => confirmar(true)}>Mover y avisar</button>
                <button className="btn btn-sec" disabled={acc.ocupado} onClick={() => confirmar(false)}>Mover sin avisar</button>
              </div>
            </>
          )}
          <Error texto={acc.error} />
        </div>
      )}
      <p className="suave chico" style={{ margin: 0 }}>Al mover con aviso, el cliente recibe un WhatsApp con el cambio.</p>
      {aviso.nodo}
    </section>
  )
}
