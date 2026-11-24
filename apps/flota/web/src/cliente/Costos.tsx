// Costos y días parados de la empresa (portal: «Costos»): por unidad, cuántos días estuvo en el taller este mes o el
// pasado y cuánto costó. El costo lo ve quien aprueba en la empresa; quien solo mira ve los días.
import { useState } from 'react'
import { useSesion } from '@nucleo/acceso/Sesion'
import { BotonesSel } from '@nucleo/controles'
import { useCarga } from '@nucleo/datos/useCarga'
import { dinero, hoyGT } from '@nucleo/formato'
import { Flota } from '../datos'
import { Error } from '../comun'

const mesDe = (corrimiento: number) => { const [a, m] = hoyGT().split('-').map(Number); return new Date(Date.UTC(a, m - 1 + corrimiento, 1)).toISOString().slice(0, 10) }
const nombreMes = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', { month: 'long' })
const tono = (p: number) => (p >= 95 ? 'bien' : p >= 85 ? 'aviso' : 'mal')
const dias = (t: number) => (!t ? 'Todo el mes trabajando' : t < 1 ? `${Math.max(1, Math.round(t * 24))} h en el taller` : `${Math.round(t)} ${Math.round(t) === 1 ? 'día' : 'días'} en el taller`)

export function Costos() {
  const { negocio } = useSesion()
  const neg = negocio!.negocio_id
  const flotas = useCarga(() => Flota.flotas(neg), [neg])
  const flota = flotas.datos?.[0]
  const [mes, setMes] = useState(mesDe(0))
  const disp = useCarga(() => (flota ? Flota.disponibilidad(flota.id, mes) : Promise.resolve([])), [flota?.id, mes])
  const filas = disp.datos || []
  const conCosto = filas.some((f) => f.costo !== null)
  const total = filas.reduce((s, f) => s + Number(f.costo || 0), 0)
  const parados = filas.reduce((s, f) => s + Number(f.dias_taller), 0)
  const promedio = filas.length ? Math.round(filas.reduce((s, f) => s + f.disponibilidad, 0) / filas.length) : null
  return (
    <>
      <Error texto={flotas.error || disp.error} />
      <section className="tarjeta">
        <h1 style={{ fontSize: 17 }}>Costos y días parados</h1>
        <BotonesSel valor={mes} alCambiar={setMes} opciones={[{ valor: mesDe(0), texto: 'Este mes' }, { valor: mesDe(-1), texto: 'Mes pasado' }]} />
        {promedio !== null && (
          <div className="cifras cifras-cliente">
            <div className="cifra"><span className="etiqueta">Disponible</span><span className="cifra-valor num">{promedio} %</span></div>
            <div className="cifra"><span className="etiqueta">Días parados</span><span className="cifra-valor num">{Math.round(parados * 10) / 10}</span></div>
            {conCosto && <div className="cifra"><span className="etiqueta">Costo</span><span className="cifra-valor num">{dinero(total)}</span></div>}
          </div>
        )}
        <span className="suave chico">En {nombreMes(mes)}: días que cada unidad estuvo trabajando y no en el taller, desde que se abre la orden hasta que te la entregan.</span>
      </section>
      <section className="tarjeta" style={{ gap: 0 }}>
        <h2>Por unidad</h2>
        {disp.cargando ? <p className="cargando">Cargando…</p> : filas.length === 0 ? <p className="vacio">Sin unidades ese mes.</p> : (
          <div className="lista-filas">
            {filas.map((f) => (
              <div key={f.unidad_id} className="columna" style={{ gap: 6, padding: '10px 0' }}>
                <div className="fila-entre"><span><b>{f.placa}</b> <span className="suave chico">{f.descripcion}</span></span>{f.costo !== null && <b>{dinero(f.costo)}</b>}</div>
                <div className="fila" style={{ gap: 8 }}>
                  <div className="barra-pista" style={{ flex: 1 }} role="img" aria-label={`${f.disponibilidad} % disponible`}><div style={{ width: `${f.disponibilidad}%`, background: `var(--${tono(f.disponibilidad)})` }} /></div>
                  <b className="num" style={{ minWidth: 44, textAlign: 'right' }}>{f.disponibilidad} %</b>
                </div>
                <span className="suave chico">{dias(Number(f.dias_taller))}{f.ordenes ? ` · ${f.ordenes} ${f.ordenes === 1 ? 'orden' : 'órdenes'}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      {!conCosto && filas.length > 0 && <p className="suave chico" style={{ margin: 0 }}>Los montos los ve quien aprueba en tu empresa.</p>}
    </>
  )
}
