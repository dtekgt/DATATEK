# DATATEK Remastered — Baseline R1

**Estado:** fuente operativa inicial de la remasterización  
**Fecha:** 2026-08-06  
**Repositorio:** `dtekgt/DATATEK`  
**Commit congelado:** `9f5d5f0982da15c747c6620cc9e174dbdf6b13a5` (`v3.3`)  
**Rama de trabajo:** `remaster/r1`  
**Referencia protegida:** `baseline/pre-remaster-r1`  
**Issue maestro:** `#1 REMASTER-0001 — Baseline forense R1`

---

## 1. Propósito

Este documento marca el inicio formal de DATATEK Remastered.

No autoriza nuevas funciones. Su propósito es congelar una base, reconciliar el estado real del repositorio y producir evidencia reproducible antes de continuar con la Fase 1.

La doctrina central es:

> Un vehículo entra con un problema, el sistema estructura lo que ocurre, el taller documenta y diagnostica, el cliente entiende y autoriza, el técnico ejecuta, el resultado se verifica, el historial se actualiza y DATATEK aprende del caso.

Todo trabajo de R1 debe servir a ese circuito.

---

## 2. Autoridad

La fuente normativa principal es:

`DATATEK_REMASTERED_BIBLIA_MAESTRA_DE_ACCION_R1.md`

Jerarquía inicial:

1. Biblia Maestra R1.
2. Current State Map R1.
3. Canonical Flow R1.
4. Intelligence Data Contract R1.
5. Contratos técnicos vigentes.
6. Documentos R0 e históricos.
7. README y handoffs temporales.
8. Sugerencias de cualquier IA.

Una IA no puede cambiar una ley de producto solo porque otra implementación resulte más sencilla.

---

## 3. Decisiones congeladas

- DATATEK es un solo ecosistema.
- Pro opera, Pass demuestra, Market conecta y Control gobierna.
- La unidad central es el caso verificable; la cita solo administra tiempo.
- DTEK es el taller fundador y laboratorio, no el dueño universal de la plataforma.
- Se conserva un monolito modular antes de considerar microservicios.
- PostgreSQL es la fuente oficial de verdad.
- El historial se corrige mediante eventos; no se reescribe silenciosamente.
- La IA propone y prepara; una persona autorizada confirma acciones críticas.
- La confianza se mide con evidencia, resultados, garantías y reincidencia.

---

## 4. Estado conocido al congelar el baseline

### Activos existentes

- monorepo modular;
- separación Pro / Pass / Market / Control;
- dominio tipado;
- organizaciones, sucursales, roles y permisos;
- tenancy y contratos de RLS;
- clientes y vehículos;
- intake y casos;
- agenda;
- inspección de frenos y evidencia;
- cotizaciones versionadas;
- congelamiento y hash de cotización;
- autorización mediante token;
- auditoría, eventos, outbox e idempotencia;
- documentos;
- catálogo de servicios y productos;
- corrección y disputa de hechos históricos;
- pruebas de dominio y contratos de consulta.

### No demostrado todavía como producto

- persistencia productiva completa;
- autenticación productiva cerrada;
- todas las migraciones ejecutadas contra PostgreSQL real;
- RLS comprobada contra una base viva;
- E2E completo ejecutado en un entorno sin restricciones;
- orden de trabajo posterior a autorización;
- workspace móvil del mecánico;
- ejecución, piezas, calidad, entrega y garantía;
- seguimiento y reincidencia;
- copilotos de IA;
- Graph operativo;
- Parts Intelligence;
- piloto comercial con talleres fundadores.

---

## 5. Restricciones de REMASTER-0001

Durante el baseline:

- no se modifica `main`;
- no se agregan capacidades nuevas;
- no se confunde una prueba escrita con una prueba ejecutada;
- no se trata el estado en memoria como persistencia productiva;
- no se altera una ley de producto para facilitar código;
- no se ocultan fallos, bloqueos o evidencia incompleta.

---

## 6. Puertas obligatorias

```text
instalación limpia
→ format
→ lint
→ typecheck
→ spec check
→ unit tests
→ integration tests
→ database tests
→ build
→ E2E
→ security review
→ accessibility
→ product acceptance
```

Además:

- aplicar migraciones en PostgreSQL/Supabase real;
- ejecutar pgTAP;
- probar dos organizaciones independientes;
- verificar no enumeración;
- revisar secretos;
- probar fechas en `America/Guatemala`;
- comprobar backup y restauración básica.

---

## 7. Clasificación forense requerida

Cada ruta, tabla, comando, query, evento, componente y documento debe clasificarse como:

- `KEEP`
- `REMAP`
- `COMPLETE`
- `REPLACE`
- `DEFER`
- `DELETE`

Ningún módulo avanza a construcción sin esta clasificación.

---

## 8. Puerta de salida

REMASTER-0001 termina únicamente cuando exista:

- baseline reproducible;
- evidencia ejecutada;
- cero secretos expuestos;
- riesgos P0 identificados;
- documentación reconciliada;
- mapa del estado actual;
- matriz forense completa;
- rama preparada para Unified Automotive Core;
- ninguna función nueva agregada durante el corte.

---

## 9. Bloqueo registrado en el arranque

El primer entorno utilizado para iniciar la auditoría no pudo clonar GitHub por resolución DNS y tampoco pudo materializar el ZIP de biblioteca por una respuesta 403.

Esto no se registra como éxito ni como fallo del producto. Las ramas y el Issue #1 sí fueron creados mediante el conector oficial de GitHub. Las pruebas ejecutables deben correrse en un entorno con acceso al repositorio, Node/pnpm, PostgreSQL/Supabase y navegador Playwright.
