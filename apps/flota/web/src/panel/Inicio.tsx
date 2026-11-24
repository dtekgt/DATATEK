// Panel principal (paquete F-07): lo que el dueño ve al entrar. Cuatro cifras, lo que hay que hacer (necesidades con su
// botón), lo que vence en 30 días y la disponibilidad del mes por unidad: días trabajando y cuánto costó.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Avisos } from './Avisos'
import { useSesion } from '@nucleo/acceso/Sesion'
import { BotonesSel, Chip, useAvisoDeshacer } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { dinero, fechaCorta, hoyGT } from '@nucleo/formato'
import { Flota } from '../datos'
import { Nucleo, type Necesidad } from '@nucleo/datos/nucleo'
import { DOC, Error, diasHasta } from '../comun'

const mesDe = (corrimiento: number) => { const [a, m] = hoyGT().split('-').map(Number); const d = new Date(Date.UTC(a, m - 1 + corrimiento, 1)); return d.toISOString().slice(0, 10) }
const nombreMes = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('es-GT', { month: 'long' })
const enTaller = (t: number, d: number) => (!t ? '' : t < 1 ? `${Math.max(1, Math.round(t * 24))} h de ${Math.round(d)} días` : `${Math.round(t)} de ${Math.round(d)} días`)
const tonoDisp = (p: number) => (p >= 95 ? 'bien' : p >= 85 ? 'aviso' : 'mal') as 'bien' | 'aviso' | 'mal'

function BarraDisp({ p }: { p: number }) {
  return (
    <div className="fila" style={{ gap: 8 }}>
      <div className="barra-pista" style={{ flex: 1 }} role="img" aria-label={`${p} % disponible`}><div style={{ width: `${p}%`, background: `var(--${tonoDisp(p)})` }} /></div>
      <b className="num" style={{ minWidth: 44, textAlign: 'right' }}>{p} %</b>
    </div>
  )
}

function Cifra({ rotulo, valor, sub, a }: { rotulo: string; valor: string; sub?: string; a?: string }) {
  const cuerpo = <><span className="etiqueta">{rotulo}</span><span className="cifra-valor num">{valor}</span>{sub && <span className="suave chico">{sub}</span>}</>
  return a ? <Link to={a} className="tarjeta cifra">{cuerpo}</Link> : <div className="tarjeta cifra">{cuerpo}</div>
}

export function Inicio() {
  const { negocio, puede } = useSesion()
  const neg = negocio!.negocio_id
  const panel = useCarga(() => Flota.panel(neg), [neg])
  const necesidades = useCarga(() => Nucleo.necesidades(neg), [neg])
  const flotas = useCarga(() => Flota.flotas(neg), [neg])
  const [flota, setFlota] = useState<string | null>(null)
  const [mes, setMes] = useState(mesDe(0))
  const actual = flota || flotas.datos?.[0]?.id || null
  const disp = useCarga(() => (actual ? Flota.disponibilidad(actual, mes) : Promise.resolve([])), [actual, mes])
  const acc = useAccion()
  const aviso = useAvisoDeshacer()
  const p = panel.datos
  const filas = disp.datos || []
  const promedio = filas.length ? Math.round(filas.reduce((s, f) => s + f.disponibilidad, 0) / filas.length) : null
  const conCosto = filas.some((f) => f.costo !== null)

  const hacer = (n: Necesidad) => acc.correr(async () => {
    if (n.accion === 'pedir_km') {
      const r = await Flota.pedirKm(n.objetos)
      aviso.mostrar(`Le pedimos el km a ${r.enviados} ${r.enviados === 1 ? 'piloto' : 'pilotos'} por WhatsApp${r.sin_telefono ? ` · ${r.sin_telefono} sin teléfono` : ''}.`)
    } else if (n.accion === 'avisar') {
      const r = await Flota.avisarDocumentos(n.objetos)
      aviso.mostrar(r.enviados ? `Le avisamos a la empresa de ${r.enviados} ${r.enviados === 1 ? 'documento' : 'documentos'}.` : 'Ya se había avisado en las últimas 4 horas.')
    }
    await Nucleo.resolverNecesidad(n.id)
    necesidades.recargar()
  })
  const avisarUno = (unidad: string) => acc.correr(async () => {
    const r = await Flota.avisarDocumentos([unidad])
    aviso.mostrar(r.enviados ? 'Le avisamos a la empresa por WhatsApp.' : 'Ya se le había avisado en las últimas 4 horas.')
  })

  return (
    <>
      <div className="titulo-pagina"><div><h1>Hoy</h1><span className="suave">{new Date(hoyGT() + 'T12:00:00').toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div></div>
      <Error texto={panel.error || necesidades.error || acc.error} />
      {p && (
        <div className="cifras">
          <Cifra rotulo="Unidades" valor={String(p.unidades)} sub={`${p.en_taller} en el taller ahora`} a="/panel/unidades" />
          <Cifra rotulo="Órdenes abiertas" valor={String(p.ordenes_abiertas)} sub={[p.esperando_empresa && `${p.esperando_empresa} esperan a la empresa`, p.listas_para_entregar && `${p.listas_para_entregar} listas`].filter(Boolean).join(' · ') || 'Nada esperando'} a="/panel/ordenes" />
          {p.por_cobrar !== null
            ? <Cifra rotulo="Por cobrar" valor={dinero(p.por_cobrar)} sub={p.vencidos ? `${p.vencidos} ${p.vencidos === 1 ? 'cobro vencido' : 'cobros vencidos'}` : 'Nada vencido'} a="/panel/mas" />
            : <Cifra rotulo="Sin km reciente" valor={String(p.sin_km_reciente)} sub="unidades sin reporte en 14 días" a="/panel/unidades" />}
          {p.cobrado_mes !== null
            ? <Cifra rotulo={`Cobrado en ${nombreMes(mesDe(0))}`} valor={dinero(p.cobrado_mes)} sub={`de ${dinero(p.facturado_mes)} facturado`} />
            : <Cifra rotulo="Disponibilidad del mes" valor={promedio === null ? '—' : `${promedio} %`} sub="promedio de la flota" />}
        </div>
      )}

      <Avisos />

      {(necesidades.datos?.length ?? 0) > 0 && (
        <section className="tarjeta" style={{ marginBottom: 16 }}>
          <h2>Lo que hay que hacer</h2>
          {necesidades.datos!.map((n) => (
            <div key={n.id} className="aviso-caja fila-entre envolver" style={{ gap: 12 }}>
              <div className="columna" style={{ gap: 2 }}><b>{n.titulo}</b>{n.detalle && <span className="chico">{n.detalle}</span>}</div>
              <div className="fila envolver">
                {n.accion === 'pedir_km' && puede('enviar_recordatorios') && <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => hacer(n)}>Pedir km por WhatsApp</button>}
                {n.accion === 'avisar' && puede('enviar_recordatorios') && <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => hacer(n)}>Avisar a la empresa</button>}
                {n.accion === 'agendar' && <Link className="btn btn-chico" to="/panel/unidades">Ver unidades</Link>}
                {n.accion === 'completar' && <Link className="btn btn-chico" to="/panel/flotas">Completar pilotos</Link>}
                <button className="btn btn-chico btn-sec" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Nucleo.resolverNecesidad(n.id); necesidades.recargar() })}>Ya está</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="tarjeta" style={{ marginBottom: 16 }}>
        <h2>Vence en los próximos 30 días</h2>
        {!p ? <p className="cargando">Cargando…</p> : p.vence.length === 0 ? <p className="vacio">Nada vence en 30 días.</p> : (
          <div className="lista-filas">
            {p.vence.map((v, i) => {
              const d = diasHasta(v.vence)
              return (
                <div key={i} className="fila-dato">
                  <div><div className="titulo">{v.tipo === 'documento' ? (DOC[v.que] || v.que) : v.que[0].toUpperCase() + v.que.slice(1)} · {v.placa || 'sin unidad'}</div>
                    <div className="sub">{v.flota} · {fechaCorta(v.vence)}</div></div>
                  <div className="fila envolver" style={{ justifyContent: 'flex-end' }}>
                    <Chip tono={d < 0 ? 'mal' : 'aviso'}>{d < 0 ? `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}` : d === 0 ? 'Vence hoy' : `En ${d} ${d === 1 ? 'día' : 'días'}`}</Chip>
                    {v.tipo === 'documento' && v.unidad_id && puede('enviar_recordatorios') && <button className="btn btn-chico btn-sec" disabled={acc.ocupado} onClick={() => avisarUno(v.unidad_id!)}>Avisar</button>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="tarjeta">
        <div className="fila-entre envolver"><h2>Disponibilidad de {nombreMes(mes)}</h2>{promedio !== null && <span className="suave">Promedio <b className="num">{promedio} %</b></span>}</div>
        <div className="fila envolver" style={{ gap: 16 }}>
          {(flotas.datos?.length ?? 0) > 1 && <BotonesSel rotulo="Flota" valor={actual} alCambiar={setFlota} opciones={(flotas.datos || []).map((f) => ({ valor: f.id, texto: f.nombre }))} />}
          <BotonesSel rotulo="Mes" valor={mes} alCambiar={setMes} opciones={[{ valor: mesDe(0), texto: 'Este mes' }, { valor: mesDe(-1), texto: 'Mes pasado' }]} />
        </div>
        <span className="suave chico">Días que cada unidad estuvo con la empresa y no en el taller (desde que se abre la orden hasta que se entrega).</span>
        <Error texto={disp.error} />
        {disp.cargando ? <p className="cargando">Cargando…</p> : filas.length === 0 ? <p className="vacio">Sin unidades ese mes.</p> : (
          <>
          <div className="lista-filas solo-telefono">
            {filas.map((f) => (
              <div key={f.unidad_id} className="columna" style={{ gap: 6, padding: '10px 0' }}>
                <div className="fila-entre"><b>{f.placa}</b><span className="suave chico">{f.descripcion}</span></div>
                <BarraDisp p={f.disponibilidad} />
                <span className="suave chico">{[enTaller(f.dias_taller, f.dias) && `${enTaller(f.dias_taller, f.dias)} en taller`, f.ordenes && `${f.ordenes} ${f.ordenes === 1 ? 'orden' : 'órdenes'}`, f.costo && dinero(f.costo)].filter(Boolean).join(' · ') || 'Todo el mes con la empresa'}</span>
              </div>
            ))}
          </div>
          <div className="caja-tabla solo-ancho">
            <table className="tabla">
              <thead><tr><th>Unidad</th><th>Disponibilidad</th><th className="num">En taller</th><th className="num">Órdenes</th>{conCosto && <th className="num">Costo</th>}</tr></thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.unidad_id}>
                    <td><b>{f.placa}</b><div className="suave chico">{f.descripcion}</div></td>
                    <td style={{ minWidth: 160 }}><BarraDisp p={f.disponibilidad} /></td>
                    <td className="num">{enTaller(f.dias_taller, f.dias) || '—'}</td>
                    <td className="num">{f.ordenes || '—'}</td>
                    {conCosto && <td className="num">{f.costo ? dinero(f.costo) : '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      {aviso.nodo}
    </>
  )
}
