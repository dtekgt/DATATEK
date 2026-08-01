# ADR 0004 — Datatek Control en aplicación y sesión separadas

**Estado:** aceptado
**Fecha:** 2026-08-01
**Contexto:** R0-B, primer shell ejecutable

## Contexto

R0-A ley/frontera: "Control y las superficies públicas no comparten cookie de
sesión." Control gobierna la red completa (organizaciones, usuarios,
soporte con sesión elevada, seguridad, auditoría) y por eso necesita un
modelo de confianza distinto al de un visitante público, un taller o un
conductor.

## Decisión

`apps/control` es una aplicación Next.js **separada** de `apps/web`:

- puerto propio (`3001` en desarrollo, distinto de `3000`);
- `next.config.ts`, `layout.tsx` y árbol de rutas propios;
- ningún cookie, contexto de React, ni estado de sesión se comparte con
  `apps/web` — son procesos HTTP distintos;
- `ControlShell` (en `apps/control/src/components/control-shell.tsx`)
  incluye `ElevatedAccessBanner` para hacer visible, cuando corresponda,
  que una acción de soporte corre bajo sesión elevada auditada (ley 19);
  en R0-B esa bandera es una fixture (`active: false`) — R0-C conecta la
  elevación real.
- Control reutiliza los mismos paquetes compartidos (`domain`, `application`,
  `ui`) que `apps/web`, pero nunca importa código de `apps/web` ni viceversa.

## Alternativas consideradas

- **Una sola app Next.js con rutas `/control/*` protegidas por middleware:**
  rechazado. Un bug de autorización en el middleware filtraría capacidad de
  plataforma hacia la superficie pública en el mismo proceso/cookie. Mantener
  procesos separados hace que ese error de clase sea estructuralmente
  imposible, no solo improbable.
- **Control como subdominio del mismo despliegue:** diferido. R0-B no
  despliega; cuando exista despliegue real, Control debe vivir en un dominio
  o subdominio propio con cookies `Host-`/`__Secure-` no compartidas.

## Consecuencias

- Cualquier prueba de aislamiento (manual en R0-B, automatizada desde R0-C)
  debe verificar que autenticarse en `apps/web` no otorga sesión en
  `apps/control`, y viceversa.
- El costo es duplicar un poco de configuración (tokens, layout, shell) entre
  `apps/web` y `apps/control`; se acepta ese costo a cambio del aislamiento.
- `packages/ui` no puede asumir que ambas apps comparten contexto de React;
  todos los componentes de navegación reciben datos por props, nunca leen un
  contexto global compartido entre apps.
