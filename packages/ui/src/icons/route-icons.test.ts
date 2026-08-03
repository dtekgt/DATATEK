// R0-E Fase 3 — el mapa de iconos NO puede desincronizarse del registro.
//
// `RouteIcon` pasó de un lookup dinámico sobre `import * as icons` (que
// resolvía cualquier nombre, a costa de empaquetar los 1756 iconos de la
// librería) a un mapa explícito de 45 entradas. Ese cambio compra 603 KB por
// app, pero introduce un modo de fallo nuevo: si alguien agrega una ruta con
// un icono que no está en el mapa, `RouteIcon` cae al fallback en SILENCIO y
// nadie se entera hasta verlo en pantalla.
//
// Este test cierra esa brecha. Es la contraparte obligatoria de la
// optimización, no un extra.
import { describe, it } from "node:test";
import { expect } from "expect";
import { ROUTE_REGISTRY } from "@datatek/domain";
import { ROUTE_ICONS } from "./route-icons.tsx";

describe("ROUTE_ICONS cubre el registro canónico de rutas", () => {
  it("cada icono declarado en las 58 rutas existe en el mapa", () => {
    const declarados = [...new Set(ROUTE_REGISTRY.map((r) => r.icon))].sort();
    const faltantes = declarados.filter((nombre) => !(nombre in ROUTE_ICONS));

    // El mensaje importa: si esto falla, quien lo lea necesita saber qué
    // nombre agregar y dónde, no sólo que "falló".
    expect({ faltantes, comoArreglar: "agregar el import nombrado en route-icons.tsx" }).toEqual({
      faltantes: [],
      comoArreglar: "agregar el import nombrado en route-icons.tsx",
    });
  });

  it("todo valor del mapa es un tipo de componente renderizable", () => {
    // Los iconos de lucide son `forwardRef`, que en React es un OBJETO
    // (`{$$typeof: Symbol(react.forward_ref), render}`), no una función. Un
    // `typeof === "function"` los rechazaría a todos.
    for (const [nombre, componente] of Object.entries(ROUTE_ICONS)) {
      const tipo = typeof componente;
      expect(tipo === "function" || tipo === "object").toBe(true);
      expect(componente).not.toBeNull();
      expect(nombre.length).toBeGreaterThan(0);
    }
  });

  it("el mapa no crece sin querer: sólo lo del registro más los literales conocidos", () => {
    // `MoreHorizontal` lo pasa `pro-shell.tsx` como literal para el grupo
    // "más" de la navegación inferior; no sale del registro.
    const LITERALES_CONOCIDOS = new Set(["MoreHorizontal"]);
    const declarados = new Set(ROUTE_REGISTRY.map((r) => r.icon));

    const sobrantes = Object.keys(ROUTE_ICONS).filter(
      (nombre) => !declarados.has(nombre) && !LITERALES_CONOCIDOS.has(nombre),
    );

    // Un icono que ya nadie usa sigue costando bytes en el bundle.
    expect(sobrantes).toEqual([]);
  });
});
