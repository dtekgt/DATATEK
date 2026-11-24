// Fallas del piloto y pedidos de la empresa que el taller no ha atendido: se abre la orden o se descarta en un toque.
// Va en «Hoy» y, para quien no ve el panel (técnico), arriba de las órdenes.
import { useNavigate } from 'react-router-dom'
import { useSesion } from '@nucleo/acceso/Sesion'
import { Chip } from '@nucleo/controles'
import { useAccion, useCarga } from '@nucleo/datos/useCarga'
import { fechaCorta } from '@nucleo/formato'
import { Flota } from '../datos'
import { Error } from '../comun'

export function Avisos() {
  const { negocio, puede } = useSesion()
  const neg = negocio!.negocio_id
  const avisos = useCarga(() => (puede('ver_ordenes') ? Flota.avisos(neg) : Promise.resolve([])), [neg])
  const acc = useAccion()
  const nav = useNavigate()
  if (!avisos.datos?.length && !avisos.error) return null
  return (
    <section className="tarjeta" style={{ marginBottom: 16 }}>
      <div className="fila-entre"><h2>Fallas y pedidos sin atender</h2><span className="suave chico">de pilotos y empresas</span></div>
      <Error texto={avisos.error || acc.error} />
      <div className="lista-filas">
        {(avisos.datos || []).map((a) => (
          <div key={a.evento_id} className="fila-dato envolver">
            <div style={{ minWidth: 0 }}><div className="titulo"><Chip tono={a.tipo === 'falla' ? 'mal' : 'aviso'}>{a.tipo === 'falla' ? 'Falla' : 'Pedido'}</Chip> {a.titulo}</div>
              <div className="sub">{a.flota}{a.quien ? ` · ${a.quien}` : ''} · {fechaCorta(a.en)}</div></div>
            <div className="fila envolver" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-chico" disabled={acc.ocupado} onClick={() => acc.correr(async () => { const o = await Flota.atenderAviso(a.evento_id, true); if (o) nav(`/panel/ordenes/${o}`) })}>Abrir orden</button>
              <button className="btn btn-chico btn-sec" disabled={acc.ocupado} onClick={() => acc.correr(async () => { await Flota.atenderAviso(a.evento_id, false); avisos.recargar() })}>Descartar</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
