# Baseline de performance — R0-E

Fecha de medición: 2026-08-03
Commit: R0-E Fase 3
Comando: `pnpm build` (Next.js 16.2.12, webpack) tras `rm -rf apps/*/.next`

---

## 0. Por qué este documento existe y no una captura de la salida del build

`next build` normalmente imprime una tabla con `Size` y `First Load JS` por
ruta. **En este entorno no lo hace.** El binario nativo de SWC está bloqueado
por una política de Application Control de Windows:

```
⚠ Attempted to load @next/swc-win32-x64-msvc, but an error occurred:
  An Application Control policy has blocked this file.
  Skipping creating a lockfile ... because we're using WASM bindings
```

Con el fallback WASM, la tabla de rutas sale **sin columnas de tamaño**. No hay
números que copiar de la salida del build, así que todas las cifras de este
documento se midieron directamente sobre los artefactos en
`apps/*/.next/static/`. El método es reproducible:

```bash
node -e "
const fs=require('fs'),path=require('path');
for(const app of ['web','control']){
  const dir=path.join('apps',app,'.next','static','chunks');
  let files=0,bytes=0;
  const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name);
    if(e.isDirectory())walk(p);
    else if(e.name.endsWith('.js')){files++;bytes+=fs.statSync(p).size;}
  }};
  walk(dir);
  console.log(app, files+' archivos', Math.round(bytes/1024)+' KB');
}"
```

**Las cifras son sin comprimir.** Servidas con gzip/brotli el peso en red es
aproximadamente un tercio. No se reportan cifras comprimidas porque no se
midieron; estimarlas y presentarlas como medición sería exactamente lo que
este documento no debe hacer.

---

## 1. Hallazgo principal: la librería de iconos completa en el bundle

### Lo que se midió primero

| app | archivos JS | total | chunk mayor |
|---|---|---|---|
| `apps/web` | 72 | 1,983 KB | **603.5 KB** |
| `apps/control` | 33 | 1,739 KB | **603.4 KB** |

Un chunk de 603 KB, prácticamente idéntico en las dos apps. Su contenido:

```
"use strict";(self.webpackChunk_N_E=...).push([[7236],{32:(e,a,t)=>{
t.d(a,{A:()=>h});let h=(0,t(72019).A)("subscript",[["path",{d:"m4 5 8 8",…
```

**1756 definiciones de icono** — la librería `lucide-react` entera, con toda
su data de paths SVG. El 30% del JS de `apps/web` y el 35% del de
`apps/control`, pagado por separado en cada app.

### Causa

`apps/web/src/lib/icon.tsx` y su gemelo en `apps/control`:

```tsx
import * as icons from "lucide-react";
const Component = icons[name];   // `name` es un string de runtime
```

Un import de namespace con lookup dinámico es **intree-shakeable por
definición**: el bundler no puede saber qué claves se van a pedir, así que
tiene que incluirlas todas.

El detalle que lo vuelve corregible: los nombres **no son arbitrarios**. Salen
del campo `icon` del registro canónico de rutas
(`packages/domain/src/routes/route-registry.ts`), que es finito y conocido en
tiempo de build. Son 43, más `MoreHorizontal` (literal en `pro-shell.tsx`) y
el fallback `HelpCircle`: **45 iconos para 1756 empaquetados.**

### Corrección

Mapa explícito con imports nombrados, en `packages/ui/src/icons/route-icons.tsx`
— compartido, porque el costo se estaba pagando dos veces y mantener dos
listas de 45 nombres sincronizadas a mano es una promesa que nadie cumple.
Los dos `icon.tsx` de las apps quedaron como re-export, así que ningún punto
de llamada cambió.

La optimización introduce un modo de fallo nuevo: una ruta con un icono fuera
del mapa caería al fallback **en silencio**. `route-icons.test.ts` es la
contraparte obligatoria — verifica que el mapa cubra todo icono del registro,
y también que no sobre ninguno (un icono que ya nadie usa sigue costando
bytes).

### Resultado medido

| app | antes | después | delta |
|---|---|---|---|
| `apps/web` | 1,983 KB · 72 archivos · 1756 iconos | **1,224 KB** · 71 · **53** | **−759 KB (−38.3%)** |
| `apps/control` | 1,739 KB · 33 archivos · 1756 iconos | **990 KB** · 32 · **52** | **−749 KB (−43.1%)** |

Los 53 y 52 restantes son la unión de los 45 del mapa con los que
`packages/ui` importa por nombre en sus propios componentes
(`feedback.tsx`, `states.tsx`, `nav/shell-parts.tsx`, `domain/pass.tsx`) —
imports nombrados que sí se podaban desde antes.

La reducción supera los 603 KB del chunk porque al desaparecer el módulo
gigante webpack reagrupó lo demás y eliminó duplicación entre chunks.

### Verificación funcional

Bajar bytes rompiendo los iconos no sería una mejora. Sobre el servidor de
desarrollo, en `/pro/o/[orgSlug]/cases/[caseId]`:

```
svgTotal: 20 | svgConGeometria: 20 | svgVacios: 0 | clasesLucide: 20
muestra: lucide-menu, lucide-layout-dashboard, lucide-inbox, lucide-folder-kanban
```

Los 20 iconos renderizan con su geometría real. Ningún fallback, ningún hueco.

---

## 2. Composición actual del bundle

`apps/web` — 71 archivos, 1,224 KB:

| KB | chunk | qué es |
|---|---|---|
| 217.1 | `7252-*.js` | vendor compartido |
| 195.2 | `37dbdff0-*.js` | vendor compartido |
| 185.2 | `framework-*.js` | React + React DOM |
| 128.9 | `main-*.js` | runtime de Next |
| 110.0 | `polyfills-*.js` | polyfills de navegador |

`apps/control` — 32 archivos, 990 KB: mismos cinco chunks con hashes
distintos y sin el resto de superficie de producto. CSS: 13.1 KB en `web`,
7.0 KB en `control`.

**Los cinco chunks mayores son framework, no código de producto.** Sumados son
836 KB de los 1,224 KB de `web` (68%). El código propio de Datatek es el
resto. Esto es el piso de una app Next 16 con React 19; no hay nada que
recortar ahí sin cambiar de framework.

---

## 3. Presupuestos declarados

Presupuestos sobre JS estático **sin comprimir**, medidos con el script de la
§0. Son un techo de regresión, no una meta de optimización: existen para que
un cambio que reintroduzca un problema como el de los iconos se note.

| Artefacto | Medido | Presupuesto | Margen |
|---|---|---|---|
| `apps/web` JS total | 1,224 KB | **1,400 KB** | 14% |
| `apps/control` JS total | 990 KB | **1,150 KB** | 16% |
| Chunk individual mayor | 217 KB | **300 KB** | 38% |
| `apps/web` CSS | 13.1 KB | **30 KB** | 129% |
| Definiciones de icono por app | 53 | **80** | 51% |

El presupuesto de "definiciones de icono" es el que de verdad protege contra
la regresión concreta que se corrigió: un `import * as` reintroducido dispara
el conteo a 1756 y revienta el límite por un factor de 22, mucho antes de que
alguien note 600 KB extra en un total.

**Estos presupuestos no están automatizados.** No hay un paso de CI que los
verifique y falle. Declararlos sin cablearlos es la mitad del trabajo; la otra
mitad queda como deuda explícita (§5).

---

## 4. Rutas: estáticas contra dinámicas

De la tabla del build (esta sí sale, sin tamaños):

- **`apps/web`**: 21 rutas estáticas (`○`), 26 dinámicas (`ƒ`).
- **`apps/control`**: **0 estáticas, 15 dinámicas.**

Que Control no tenga ni una ruta estática no es un accidente de configuración:
su `layout.tsx` raíz llama `getControlSession()` y `getActiveElevationBanner()`
en toda petición, y leer cookies fuerza render dinámico. Es correcto —Control
no debe servir nada precomputado a una sesión que aún no verificó— pero
significa que **cada navegación en Control cuesta un render de servidor**.
Queda dicho, no corregido.

En `apps/web`, las rutas `planned` de Pro y Pass también salen dinámicas por
la misma razón (sus layouts resuelven sesión). Una página que sólo muestra
"esto todavía no existe" está pagando una resolución de sesión completa.

---

## 5. Deuda declarada

1. **Los presupuestos de §3 no se verifican en CI.** Falta un paso que corra
   el script de la §0, compare contra la tabla y falle. Sin eso, el
   presupuesto es documentación, no una puerta.
2. **No se midió el peso comprimido.** Es lo que de verdad viaja por la red.
3. **No se midieron métricas de runtime** (LCP, TTFB, INP). Requieren un
   despliegue real; en `localhost` con datos en memoria cualquier número sería
   engañoso.
4. **No hay presupuesto por ruta**, sólo por app. `next build` no da los
   tamaños por ruta en este entorno, así que habría que derivarlos del
   manifiesto de build.
5. **Control renderiza todo en el servidor** (§4).
