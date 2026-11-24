// Tablero de órdenes del taller con filtros y alta de orden (elegir flota y unidad con botones, entrega con calendario).
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { BotonesSel, Chip, Fecha, Filtros } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { dinero, fechaCorta } from '@nucleo/formato'
import { ESTADOS, Flota, type OrdenFila } from '../datos'
import { Error } from '../comun'
import { Avisos } from './Avisos'

type Filtro = 'todas' | 'espera' | 'trabajo' | 'listas'
const EN: Record<Filtro, (o: OrdenFila) => boolean> = {
  todas: () => true,
  espera: (o) => o.estado === 'espera_cliente',
  trabajo: (o) => ['recibida', 'diagnostico', 'en_trabajo', 'control_calidad'].includes(o.estado),
  listas: (o) => o.estado === 'lista',
}

export function Ordenes() {
  const { negocio, puede } = useSesion()
  const neg = negocio!.negocio_id
  const { datos, error, cargando, recargar } = useCarga(() => Flota.ordenes(neg), [neg])
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [nueva, setNueva] = useState(false)
  const lista = useMemo(() => (datos || []).filter(EN[filtro]), [datos, filtro])
  const n = (f: Filtro) => (datos || []).filter(EN[f]).length
  return (
    <>
      <div className="titulo-pagina">
        <div><h1>Órdenes abiertas</h1><span className="suave chico">Lo que la empresa ve en vivo sale de aquí</span></div>
        {puede('ver_ordenes') && <button className="btn" onClick={() => setNueva((v) => !v)}>{nueva ? 'Cerrar' : '+ Orden'}</button>}
      </div>
      {!puede('ver_panel') && <Avisos />}
      {nueva && <NuevaOrden negocio={neg} alCrear={() => { setNueva(false); recargar() }} />}
      <section className="tarjeta">
        <Filtros valor={filtro} alCambiar={setFiltro} opciones={[
          { valor: 'todas', texto: 'Todas', n: n('todas') }, { valor: 'espera', texto: 'Esperan al cliente', n: n('espera') },
          { valor: 'trabajo', texto: 'En el taller', n: n('trabajo') }, { valor: 'listas', texto: 'Listas', n: n('listas') }]} />
        <Error texto={error} />
        {cargando ? <p className="cargando">Cargando órdenes…</p> : lista.length === 0 ? <p className="vacio">No hay órdenes aquí.</p> : (
          <div className="caja-tabla">
            <table className="tabla">
              <thead><tr><th>Orden</th><th>Unidad</th><th>Motivo</th><th>Estado</th><th>Aprobado</th><th>Entrega</th></tr></thead>
              <tbody>
                {lista.map((o) => (
                  <tr key={o.id}>
                    <td><Link to={`/panel/ordenes/${o.id}`}><b>{o.numero}</b></Link>{o.prioridad === 'urgente' && <> <Chip tono="mal">Urgente</Chip></>}</td>
                    <td><b>{o.placa}</b><div className="suave chico">{o.flota}</div></td>
                    <td>{o.motivo}</td>
                    <td><Chip tono={ESTADOS[o.estado].tono}>{ESTADOS[o.estado].texto}</Chip>{o.pendientes > 0 && <div className="suave chico">{o.pendientes} línea{o.pendientes > 1 ? 's' : ''} por aprobar</div>}</td>
                    <td>{dinero(o.total)}</td>
                    <td>{o.entrega_prometida ? fechaCorta(o.entrega_prometida) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function NuevaOrden({ negocio, alCrear }: { negocio: string; alCrear: () => void }) {
  const flotas = useCarga(() => Flota.flotas(negocio), [negocio])
  const [flota, setFlota] = useState<string | null>(null)
  const unidades = useCarga(() => (flota ? Flota.unidades(flota) : Promise.resolve([])), [flota])
  const [unidad, setUnidad] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [prioridad, setPrioridad] = useState<'normal' | 'urgente'>('normal')
  const [entrega, setEntrega] = useState<string | null>(null)
  const acc = useAccion()
  const nav = useNavigate()
  const crear = () => acc.correr(async () => {
    if (!unidad) throw new globalThis.Error('Elegí la unidad.')
    if (motivo.trim().length < 3) throw new globalThis.Error('Escribí el motivo de la orden.')
    const id = await Flota.crearOrden(unidad, motivo, prioridad, entrega ? `${entrega}T17:00:00-06:00` : null)
    alCrear(); nav(`/panel/ordenes/${id}`)
  })
  return (
    <section className="tarjeta" style={{ marginBottom: 16 }}>
      <h2>Nueva orden</h2>
      <BotonesSel rotulo="Flota" valor={flota} alCambiar={(v) => { setFlota(v); setUnidad(null) }} opciones={(flotas.datos || []).map((f) => ({ valor: f.id, texto: f.nombre, sub: `${f.unidades} unidades` }))} />
      {flota && <BotonesSel rotulo="Unidad" valor={unidad} alCambiar={setUnidad} opciones={(unidades.datos || []).map((u) => ({ valor: u.id, texto: u.placa, sub: `${u.marca} ${u.linea}` }))} />}
      <div className="campo"><label htmlFor="motivo">Motivo (lo lee la empresa)</label><input id="motivo" className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="La caja no entra en tercera" /></div>
      <div className="grilla-campos">
        <BotonesSel rotulo="Prioridad" valor={prioridad} alCambiar={setPrioridad} opciones={[{ valor: 'normal', texto: 'Normal' }, { valor: 'urgente', texto: 'Urgente', sub: 'unidad parada' }]} />
        <Fecha rotulo="Entrega prometida" valor={entrega} alCambiar={setEntrega} />
      </div>
      <Error texto={acc.error} />
      <div><button className="btn" disabled={acc.ocupado} onClick={crear}>Crear orden</button></div>
    </section>
  )
}
