// Una app, dos caras: /panel (taller D-TEK Flotas) y /mi (la empresa cliente). Se entra con teléfono y código.
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Entrar } from '@nucleo/acceso/Entrar'
import { useSesion } from '@nucleo/acceso/Sesion'
import { lazy, Suspense } from 'react'
import { FranjaSuscripcion } from '@nucleo/panel/FranjaSuscripcion'

// El panel y la herramienta del cliente se cargan por separado: la empresa no descarga el código del taller.
const Inicio = lazy(() => import('./panel/Inicio').then((m) => ({ default: m.Inicio })))
const Flotas = lazy(() => import('./panel/Flotas').then((m) => ({ default: m.Flotas })))
const Ordenes = lazy(() => import('./panel/Ordenes').then((m) => ({ default: m.Ordenes })))
const OrdenPanel = lazy(() => import('./panel/Orden').then((m) => ({ default: m.OrdenPanel })))
const UnidadPanel = lazy(() => import('./panel/Unidad').then((m) => ({ default: m.UnidadPanel })))
const Unidades = lazy(() => import('./panel/Unidades').then((m) => ({ default: m.Unidades })))
const Calendario = lazy(() => import('./panel/Calendario').then((m) => ({ default: m.Calendario })))
const Mas = lazy(() => import('./panel/Mas').then((m) => ({ default: m.Mas })))
const MiFlota = lazy(() => import('./cliente/MiFlota').then((m) => ({ default: m.MiFlota })))
const UnidadCliente = lazy(() => import('./cliente/Unidad').then((m) => ({ default: m.UnidadCliente })))
const OrdenCliente = lazy(() => import('./cliente/Orden').then((m) => ({ default: m.OrdenCliente })))
const OrdenesCliente = lazy(() => import('./cliente/Ordenes').then((m) => ({ default: m.OrdenesCliente })))
const Vence = lazy(() => import('./cliente/Vence').then((m) => ({ default: m.Vence })))
const Costos = lazy(() => import('./cliente/Costos').then((m) => ({ default: m.Costos })))
const Cuenta = lazy(() => import('./cliente/Cuenta').then((m) => ({ default: m.Cuenta })))
const Piloto = lazy(() => import('./cliente/Piloto').then((m) => ({ default: m.Piloto })))
const Cargando = () => <p className="cargando">Cargando…</p>
// Plataforma (D-TEK da de alta negocios): solo la descarga quien es plataforma.
const Plataforma = lazy(() => import('@nucleo/panel/Plataforma').then((m) => ({ default: m.Plataforma })))

const ICONOS = {
  flota: 'M2 6h12v10H2zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  orden: 'M14 7l3-3 3 3-3 3M14 7L4 17l3 3 10-10',
  cuenta: 'M3 7h18v10H3zM12 15a3 3 0 100-6 3 3 0 000 6z',
  doc: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  vence: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M12 14v3l2 1',
  costos: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
}
const Icono = ({ d }: { d: string }) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>

function MarcoPanel() {
  const { negocio, negocios, elegir, puede, plataforma } = useSesion()
  const pestanas = [
    { a: '/panel/inicio', t: 'Inicio', cap: 'ver_panel' as const },
    { a: '/panel/flotas', t: 'Flotas', cap: 'ver_clientes' as const },
    { a: '/panel/ordenes', t: 'Órdenes', cap: 'ver_ordenes' as const },
    { a: '/panel/unidades', t: 'Unidades', cap: 'ver_clientes' as const },
    { a: '/panel/calendario', t: 'Calendario', cap: 'ver_calendario' as const },
    { a: '/panel/mas', t: 'Más', cap: null },
  ].filter((p) => !p.cap || puede(p.cap))
  return (
    <>
      <header className="cabecera">
        <span className="marca">D-TEK <b>Flotas</b></span>
        <nav className="pestanas" aria-label="Secciones">
          {pestanas.map((p) => <NavLink key={p.a} to={p.a} className={({ isActive }) => (isActive ? 'activa' : '')}>{p.t}</NavLink>)}
        </nav>
        <div className="derecha">
          {plataforma && <NavLink to="/plataforma" className="chico solo-ancho">Plataforma</NavLink>}
          {negocios.filter((n) => n.como === 'miembro').length > 1 ? (
            <select className="entrada solo-ancho" aria-label="Negocio" value={negocio?.negocio_id} onChange={(e) => elegir(e.target.value)} style={{ minHeight: 36, width: 'auto' }}>
              {negocios.filter((n) => n.como === 'miembro').map((n) => <option key={n.negocio_id} value={n.negocio_id}>{n.nombre}</option>)}
            </select>
          ) : <span className="suave solo-ancho">{negocio?.nombre}</span>}
        </div>
      </header>
      <FranjaSuscripcion negocio={negocio!.negocio_id} rutaSuscripcion="/panel/mas" />
      <div className="contenido"><Suspense fallback={<Cargando />}><Outlet /></Suspense></div>
    </>
  )
}

function MarcoCliente() {
  const { negocio } = useSesion()
  const nav = [
    { a: '/mi', t: 'Mi flota', d: ICONOS.flota, fin: true },
    { a: '/mi/ordenes', t: 'Órdenes', d: ICONOS.orden },
    { a: '/mi/vence', t: 'Vence', d: ICONOS.vence },
    { a: '/mi/costos', t: 'Costos', d: ICONOS.costos },
    { a: '/mi/cuenta', t: 'Cuenta', d: ICONOS.cuenta },
  ]
  return (
    <div className="app-cliente">
      <header className="arriba"><div><strong>{negocio?.nombre}</strong><span className="suave chico">Tu flota · D-TEK Flotas</span></div></header>
      <main><Suspense fallback={<Cargando />}><Outlet /></Suspense></main>
      <nav className="barra-abajo" aria-label="Secciones">
        {nav.map((n) => <NavLink key={n.a} to={n.a} end={n.fin} className={({ isActive }) => (isActive ? 'activa' : '')}><Icono d={n.d} />{n.t}</NavLink>)}
      </nav>
    </div>
  )
}

export function App() {
  const { cargando, sesion, negocio, negocios, plataforma, puede } = useSesion()
  const lugar = useLocation()
  if (cargando) return <p className="cargando">Cargando…</p>
  if (!sesion) return <Entrar marca="D-TEK Flotas" sub="El taller de tu flota, en tu teléfono." />
  // Quien es plataforma y no tiene negocios entra directo a «Plataforma»; con negocios, la abre desde la cabecera.
  if (plataforma && !negocios.length && lugar.pathname !== '/plataforma') return <Navigate to="/plataforma" replace />
  if (plataforma && lugar.pathname === '/plataforma') return <Suspense fallback={<Cargando />}><Plataforma producto="flota" marca={<>D-TEK <b>Flotas</b></>} /></Suspense>
  if (!negocios.length) return (
    <main className="entrar"><div className="tarjeta entrar-caja"><h1 style={{ fontSize: 18 }}>Todavía no tenés acceso</h1><p className="suave">Pedile al taller que te invite con este número de teléfono.</p></div></main>
  )
  const inicioPanel = puede('ver_panel') ? '/panel/inicio' : '/panel/ordenes'
  const inicio = negocio?.como === 'miembro' ? inicioPanel : negocio?.como === 'piloto' ? '/piloto' : '/mi'
  if (lugar.pathname === '/') return <Navigate to={inicio} replace />
  return (
    <Routes>
      <Route path="/panel" element={negocio?.como === 'miembro' ? <MarcoPanel /> : <Navigate to="/mi" replace />}>
        <Route path="inicio" element={<Inicio />} />
        <Route path="flotas" element={<Flotas />} />
        <Route path="ordenes" element={<Ordenes />} />
        <Route path="ordenes/:id" element={<OrdenPanel />} />
        <Route path="unidades" element={<Unidades />} />
        <Route path="unidades/:id" element={<UnidadPanel />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="mas" element={<Mas />} />
        <Route index element={<Navigate to={inicioPanel} replace />} />
      </Route>
      <Route path="/mi" element={negocio?.como === 'cliente' ? <MarcoCliente /> : <Navigate to="/panel" replace />}>
        <Route index element={<MiFlota />} />
        <Route path="unidad/:id" element={<UnidadCliente />} />
        <Route path="ordenes" element={<OrdenesCliente />} />
        <Route path="orden/:id" element={<OrdenCliente />} />
        <Route path="vence" element={<Vence />} />
        <Route path="costos" element={<Costos />} />
        <Route path="cuenta" element={<Cuenta />} />
      </Route>
      <Route path="/piloto" element={negocio?.como === 'piloto' ? <div className="app-cliente" style={{ paddingBottom: 16 }}><header className="arriba"><div><strong>{negocio.nombre}</strong><span className="suave chico">Tu unidad · D-TEK Flotas</span></div></header><main><Suspense fallback={<Cargando />}><Piloto /></Suspense></main></div> : <Navigate to={inicio} replace />} />
      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}
