// Unidades de una flota con su salud, km y lo próximo. Filtros arriba y alta de unidad (año y km con − y +).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { Ayuda, BotonesSel, Chip, Contador, Filtros } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { fechaCorta, haceCuanto, km as fmtKm } from '@nucleo/formato'
import { Flota, type UnidadFila } from '../datos'
import { DOC, Error, proximoTexto, saludTono, textoUnidad, tonoUnidad } from '../comun'
import { Importar } from './Importar'

type F = 'todas' | 'atencion' | 'taller' | 'sin_km'
const EN: Record<F, (u: UnidadFila) => boolean> = {
  todas: () => true, atencion: (u) => u.ahora > 0 || u.cerca > 0 || u.conocidas === 0, taller: (u) => u.estado === 'taller',
  sin_km: (u) => !u.km_reportado_en || Date.now() - new Date(u.km_reportado_en).getTime() > 14 * 86400000,
}

export function Unidades() {
  const { negocio, puede } = useSesion()
  const flotas = useCarga(() => Flota.flotas(negocio!.negocio_id), [negocio!.negocio_id])
  const [flota, setFlota] = useState<string | null>(null)
  const actual = flota || flotas.datos?.[0]?.id || null
  const unidades = useCarga(() => (actual ? Flota.unidades(actual) : Promise.resolve([])), [actual])
  const [f, setF] = useState<F>('todas')
  const [alta, setAlta] = useState(false)
  const [importando, setImportando] = useState(false)
  const lista = useMemo(() => (unidades.datos || []).filter(EN[f]), [unidades.datos, f])
  const n = (x: F) => (unidades.datos || []).filter(EN[x]).length
  const nombre = flotas.datos?.find((x) => x.id === actual)?.nombre
  return (
    <>
      <div className="titulo-pagina">
        <div><h1>Unidades{nombre ? ` de ${nombre}` : ''}</h1><span className="suave chico">Lo que la empresa ve en su Garage sale de aquí</span></div>
        <div className="fila envolver">
          {puede('importar') && <button className="btn btn-sec" onClick={() => setImportando((v) => !v)}>{importando ? 'Cerrar importación' : 'Importar desde Excel'}</button>}
          {puede('ver_clientes') && actual && <button className="btn" onClick={() => setAlta((v) => !v)}>{alta ? 'Cerrar' : '+ Unidad'}</button>}
        </div>
      </div>
      {(flotas.datos?.length ?? 0) > 1 && <div style={{ marginBottom: 12 }}><BotonesSel valor={actual} alCambiar={setFlota} opciones={(flotas.datos || []).map((x) => ({ valor: x.id, texto: x.nombre, sub: `${x.unidades} unidades` }))} /></div>}
      {importando && <Importar alCambiar={unidades.recargar} alTerminar={() => { setImportando(false); unidades.recargar() }} />}
      {alta && actual && <AltaUnidad flota={actual} alCrear={() => { setAlta(false); unidades.recargar() }} />}
      <section className="tarjeta">
        <Filtros valor={f} alCambiar={setF} opciones={[{ valor: 'todas', texto: 'Todas', n: n('todas') }, { valor: 'atencion', texto: 'Piden atención', n: n('atencion') }, { valor: 'taller', texto: 'En taller', n: n('taller') }, { valor: 'sin_km', texto: 'Sin km reciente', n: n('sin_km') }]} />
        <Error texto={unidades.error || flotas.error} />
        {flotas.datos && flotas.datos.length === 0 ? <p className="vacio">Primero creá una flota en la pestaña Flotas.</p> : unidades.cargando ? <p className="cargando">Cargando unidades…</p> : lista.length === 0 ? <p className="vacio">No hay unidades aquí.</p> : (
          <div className="caja-tabla">
            <table className="tabla">
              <thead><tr><th>Unidad</th><th>Salud <Ayuda texto="De 0 a 100: cuántas piezas conocidas están al día según meses y kilómetros. Igual que en el Garage de DtekPro." /></th><th>Último km</th><th>Lo próximo</th><th>Documentos</th><th>Estado</th></tr></thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id}>
                    <td><Link to={`/panel/unidades/${u.id}`}><b>{u.placa}</b></Link><div className="suave chico">{u.marca} {u.linea} {u.anio ?? ''}{u.piloto ? ` · ${u.piloto}` : ''}</div></td>
                    <td style={{ minWidth: 130 }}>{u.conocidas === 0 ? <span className="suave">Sin datos</span> : <div className="fila"><div className="barra-pista" style={{ flex: 1 }}><div style={{ width: `${u.puntaje}%`, background: saludTono(u) === 'mal' ? 'var(--mal)' : saludTono(u) === 'aviso' ? 'var(--aviso)' : 'var(--acento)' }} /></div><b>{u.puntaje}</b></div>}</td>
                    <td>{fmtKm(u.km_actual)}<div className="suave chico">{haceCuanto(u.km_reportado_en)}</div></td>
                    <td>{proximoTexto(u)}</td>
                    <td>{u.documento_vence ? <>{DOC[u.documento_tipo || 'otro']}<div className="suave chico">vence {fechaCorta(u.documento_vence)}</div></> : '—'}</td>
                    <td><Chip tono={tonoUnidad(u)}>{textoUnidad(u)}</Chip></td>
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

function AltaUnidad({ flota, alCrear }: { flota: string; alCrear: () => void }) {
  const [placa, setPlaca] = useState('')
  const [marca, setMarca] = useState('')
  const [linea, setLinea] = useState('')
  const [anio, setAnio] = useState(2020)
  const [kmv, setKm] = useState(0)
  const acc = useAccion()
  return (
    <section className="tarjeta" style={{ marginBottom: 16 }}>
      <h2>Nueva unidad</h2>
      <div className="grilla-campos">
        <div className="campo"><label htmlFor="placa">Placa</label><input id="placa" className="entrada" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="P-123ABC" /></div>
        <div className="campo"><label htmlFor="marca">Marca</label><input id="marca" className="entrada" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Toyota" /></div>
        <div className="campo"><label htmlFor="linea">Línea</label><input id="linea" className="entrada" value={linea} onChange={(e) => setLinea(e.target.value)} placeholder="Hilux" /></div>
        <Contador rotulo="Año" valor={anio} min={1970} max={2030} alCambiar={setAnio} />
        <Contador rotulo="Kilometraje" valor={kmv} paso={1000} unidad="km" alCambiar={setKm} />
      </div>
      <Error texto={acc.error} />
      <div><button className="btn" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.agregarUnidad(flota, placa, marca, linea, anio, kmv); alCrear() })}>Agregar unidad</button></div>
    </section>
  )
}
