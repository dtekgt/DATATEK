// Vencimientos y pilotos de la empresa (portal: «Vencimientos» y «Pilotos»): servicios por hacer, documentos y licencias
// que vencen, con filtros arriba; y cada piloto con su licencia y su unidad.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { Chip, Filtros } from '@nucleo/controles'
import { useCarga } from '@nucleo/datos/useCarga'
import { fechaCorta } from '@nucleo/formato'
import { Flota, type Vencimiento } from '../datos'
import { DOC, Error, textoVence, tonoVence } from '../comun'

type F = 'todo' | 'servicio' | 'documento' | 'licencia'

const titulo = (v: Vencimiento) => (v.tipo === 'documento' ? DOC[v.que] || v.que : v.tipo === 'licencia' ? `${v.que} de ${v.quien}` : v.que)

export function Vence() {
  const { negocio } = useSesion()
  const neg = negocio!.negocio_id
  const flotas = useCarga(() => Flota.flotas(neg), [neg])
  const flota = flotas.datos?.[0]
  const vence = useCarga(() => (flota ? Flota.vencimientos(flota.id, 90) : Promise.resolve([])), [flota?.id])
  const pilotos = useCarga(() => (flota ? Flota.pilotos(flota.id) : Promise.resolve([])), [flota?.id])
  const [f, setF] = useState<F>('todo')
  const filas = (vence.datos || []).filter((v) => f === 'todo' || v.tipo === f)
  const n = (x: F) => (vence.datos || []).filter((v) => x === 'todo' || v.tipo === x).length
  if (flotas.cargando) return <p className="cargando">Cargando…</p>
  if (!flota) return <p className="vacio">Todavía no hay unidades registradas.</p>
  return (
    <>
      <Error texto={flotas.error || vence.error || pilotos.error} />
      <section className="tarjeta" style={{ gap: 8 }}>
        <h1 style={{ fontSize: 17 }}>Lo que vence</h1>
        <span className="suave chico">Servicios por hacer y lo que vence en los próximos 90 días.</span>
        <Filtros valor={f} alCambiar={setF} opciones={[{ valor: 'todo', texto: 'Todo', n: n('todo') }, { valor: 'servicio', texto: 'Servicios', n: n('servicio') }, { valor: 'documento', texto: 'Documentos', n: n('documento') }, { valor: 'licencia', texto: 'Licencias', n: n('licencia') }]} />
        {vence.cargando ? <p className="cargando">Cargando…</p> : filas.length === 0 ? <p className="vacio">Nada por vencer aquí.</p> : (
          <div className="lista-filas">
            {filas.map((v, i) => {
              const cuerpo = (
                <>
                  <div style={{ minWidth: 0 }}><div className="titulo">{titulo(v)}{v.placa ? ` · ${v.placa}` : ''}</div>
                    <div className="sub">{v.tipo === 'servicio' ? (v.estimada && v.vence ? `Estimado para el ${fechaCorta(v.vence)}` : v.detalle) : v.vence ? fechaCorta(v.vence) : ''}</div></div>
                  <Chip tono={tonoVence(v.vence)}>{v.tipo === 'servicio' && !v.estimada ? 'Pide revisión' : textoVence(v.vence)}</Chip>
                </>
              )
              return v.unidad_id ? <Link key={i} to={`/mi/unidad/${v.unidad_id}`} className="fila-dato">{cuerpo}</Link> : <div key={i} className="fila-dato">{cuerpo}</div>
            })}
          </div>
        )}
      </section>
      <section className="tarjeta" style={{ gap: 0 }}>
        <div className="fila-entre"><h2>Pilotos</h2><span className="suave chico">{pilotos.datos?.length ?? 0}</span></div>
        {(pilotos.datos?.length ?? 0) === 0 ? <p className="vacio">El taller todavía no registró pilotos.</p> : (
          <div className="lista-filas">
            {pilotos.datos!.map((p) => (
              <div key={p.id} className="fila-dato">
                <div><div className="titulo">{p.nombre}</div><div className="sub">{p.placa ? `Maneja ${p.placa}` : 'Sin unidad'} · licencia {p.licencia_tipo || '—'}{p.ligado ? '' : ' · todavía no entra con su teléfono'}</div></div>
                <Chip tono={tonoVence(p.licencia_vence)}>{p.licencia_vence ? textoVence(p.licencia_vence) : 'Sin fecha'}</Chip>
              </div>
            ))}
          </div>
        )}
        <span className="suave chico" style={{ paddingTop: 8 }}>Para agregar o cambiar un piloto, pedíselo al taller.</span>
      </section>
    </>
  )
}
