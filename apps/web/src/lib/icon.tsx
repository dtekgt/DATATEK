// El mapa de iconos vive en `@datatek/ui` porque las DOS apps lo necesitan y
// mantener dos listas de 45 nombres sincronizadas a mano es una promesa que
// nadie cumple. Ver ahí el hallazgo de performance que motivó el cambio
// (1756 iconos empaquetados, 45 usados) y `route-icons.test.ts`, que impide
// que el mapa se desincronice del registro de rutas.
//
// Este archivo se conserva como re-export para no tocar los ~8 puntos de
// llamada de los shells.
export { RouteIcon, ROUTE_ICONS } from "@datatek/ui";
