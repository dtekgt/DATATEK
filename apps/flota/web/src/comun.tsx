// Piezas de pantalla compartidas entre el panel y la herramienta del cliente de Flota.
import type { Tono } from '@nucleo/controles'
import { fechaCorta, hoyGT } from '@nucleo/formato'

export function Anillo({ puntaje, tono, sinDatos = false }: { puntaje: number; tono: 'bien' | 'aviso' | 'mal' | 'neutro'; sinDatos?: boolean }) {
  const r = 17, L = 2 * Math.PI * r
  const color = tono === 'mal' ? 'var(--mal)' : tono === 'aviso' ? 'var(--aviso)' : tono === 'neutro' ? 'var(--neutro)' : 'var(--acento)'
  return (
    <svg className="anillo" width="44" height="44" viewBox="0 0 44 44" role="img" aria-label={sinDatos ? 'Salud sin datos' : `Salud ${puntaje} de 100`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E2E8F0" strokeWidth="5" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${sinDatos ? 0 : (L * puntaje) / 100} ${L}`} transform="rotate(-90 22 22)" />
      <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F172A">{sinDatos ? '—' : puntaje}</text>
    </svg>
  )
}

type Resumen = { estado: string; ahora: number; cerca: number; conocidas: number }
export const tonoUnidad = (u: Resumen): 'bien' | 'aviso' | 'mal' | 'neutro' =>
  u.estado === 'taller' ? 'mal' : u.conocidas === 0 ? 'neutro' : u.ahora > 0 || u.cerca > 0 ? 'aviso' : 'bien'
export const textoUnidad = (u: Resumen) =>
  u.estado === 'taller' ? 'En taller' : u.conocidas === 0 ? 'Sin datos' : u.ahora > 0 ? 'Atención' : u.cerca > 0 ? 'Cerca' : 'Al día'
// Salud del anillo: sin piezas conocidas no hay puntaje (no es «0», es «no sabemos»).
export const saludTono = (u: Resumen): 'bien' | 'aviso' | 'mal' | 'neutro' => (u.conocidas === 0 ? 'neutro' : u.ahora > 0 ? 'mal' : u.cerca > 0 ? 'aviso' : 'bien')
export const proximoTexto = (u: Resumen & { proximo: string | null }) => (u.conocidas === 0 ? 'Sin historial: pedí una revisión' : u.proximo || 'Todo al día')

export const TONO_PIEZA: Record<string, { texto: string; tono: Tono }> = {
  vencido: { texto: 'Ahora', tono: 'mal' }, proximo: { texto: 'Cerca', tono: 'aviso' }, al_dia: { texto: 'Al día', tono: 'bien' }, sin_datos: { texto: 'Sin datos', tono: 'neutro' },
}

export const DOC: Record<string, string> = { seguro: 'Seguro', tarjeta_circulacion: 'Tarjeta de circulación', licencia: 'Licencia', otro: 'Documento' }

// Días hasta una fecha (día de Guatemala) y cómo decirlo: lo vencido en rojo, lo de 30 días en amarillo.
export const diasHasta = (iso: string) => Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(hoyGT() + 'T12:00:00')) / 86400000)
export const tonoVence = (iso: string | null): Tono => (!iso ? 'neutro' : diasHasta(iso) < 0 ? 'mal' : diasHasta(iso) <= 30 ? 'aviso' : 'bien')
export const textoVence = (iso: string | null) => {
  if (!iso) return 'Sin fecha'
  const d = diasHasta(iso)
  return d < 0 ? `Venció hace ${-d} ${-d === 1 ? 'día' : 'días'}` : d === 0 ? 'Vence hoy' : d <= 60 ? `Vence en ${d} ${d === 1 ? 'día' : 'días'}` : `Vence el ${fechaCorta(iso)}`
}

export { Error } from '@nucleo/controles'
