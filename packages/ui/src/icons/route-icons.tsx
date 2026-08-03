import type { ComponentType } from "react";
import {
  Activity,
  Banknote,
  BookOpen,
  Building,
  Building2,
  CalendarDays,
  Car,
  CarFront,
  ChartBar,
  Factory,
  FileSearch,
  FileText,
  FolderClock,
  FolderKanban,
  Gavel,
  Gift,
  Headset,
  HelpCircle,
  Home,
  IdCard,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link,
  ListChecks,
  Lock,
  MoreHorizontal,
  PackageCheck,
  PackageSearch,
  Plug,
  Radar,
  ScrollText,
  SendHorizontal,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tags,
  ToggleLeft,
  Truck,
  User,
  UserCog,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";

// R0-E Fase 3 — hallazgo de performance.
//
// Este archivo hacía `import * as icons from "lucide-react"` y resolvía el
// icono por índice en runtime (`icons[name]`). Un import de namespace con
// lookup dinámico es INTREE-SHAKEABLE por definición: el bundler no puede
// saber qué claves se van a pedir, así que tiene que incluirlas todas.
//
// El costo medido sobre el build de producción: **1756 definiciones de icono,
// 603 KB sin comprimir** en un solo chunk — el 30% del JS de apps/web y el
// 35% del de apps/control, en cada app por separado. Los iconos que el
// producto realmente usa son 45.
//
// La corrección es un mapa explícito. Los nombres NO son arbitrarios: salen
// del campo `icon` del registro canónico de rutas
// (packages/domain/src/routes/route-registry.ts), que es finito y conocido en
// tiempo de build. Con imports nombrados el bundler incluye exactamente estos
// 45 y descarta los otros 1711.
//
// `icon.test.ts` verifica que este mapa cubra TODO icono declarado en el
// registro. Sin ese test, agregar una ruta con un icono nuevo caería en
// silencio al fallback y nadie lo notaría hasta verlo en pantalla.
type LucideComponent = ComponentType<{ className?: string }>;

export const ROUTE_ICONS: Record<string, LucideComponent> = {
  Activity,
  Banknote,
  BookOpen,
  Building,
  Building2,
  CalendarDays,
  Car,
  CarFront,
  ChartBar,
  Factory,
  FileSearch,
  FileText,
  FolderClock,
  FolderKanban,
  Gavel,
  Gift,
  Headset,
  Home,
  IdCard,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Link,
  ListChecks,
  Lock,
  // No viene del registro: `pro-shell.tsx` lo pasa como literal para el
  // grupo "más" de la navegación inferior.
  MoreHorizontal,
  PackageCheck,
  PackageSearch,
  Plug,
  Radar,
  ScrollText,
  SendHorizontal,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tags,
  ToggleLeft,
  Truck,
  User,
  UserCog,
  Users,
  Warehouse,
  Wrench,
};

/** Resolves a Lucide icon name from the route registry to a component. Falls
 * back to a neutral icon rather than crashing if a name is ever mistyped. */
export function RouteIcon({ name, className }: { name: string; className?: string }) {
  const Resolved = ROUTE_ICONS[name] ?? HelpCircle;
  return <Resolved className={className} aria-hidden />;
}
