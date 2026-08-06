# DATATEK Remastered — Current State Map R1

**Estado:** borrador forense inicial  
**Fecha:** 2026-08-06  
**Baseline:** `9f5d5f0982da15c747c6620cc9e174dbdf6b13a5`  
**Rama:** `remaster/r1`  
**Issue:** `#1 REMASTER-0001`

> Este mapa registra únicamente lo respaldado por el repositorio, commits y documentos disponibles. No convierte artefactos escritos en evidencia ejecutada.

---

## 1. Veredicto inicial

DATATEK no está en cero y no debe reiniciarse.

El proyecto ya contiene una base de plataforma seria y un vertical funcional en estado de motor/comandos hasta autorización. La brecha principal está entre:

- arquitectura y contratos;
- persistencia y autenticación productivas;
- ejecución completa del servicio;
- experiencia final;
- inteligencia integrada;
- validación comercial.

La dirección recomendada es conservar el chasis y completar el circuito:

```text
síntoma
→ caso
→ inspección
→ diagnóstico
→ autorización
→ ejecución
→ resultado
→ Pass
→ seguimiento
→ aprendizaje
```

---

## 2. Superficies

| Superficie | Estado inicial | Clasificación preliminar | Acción |
|---|---|---|---|
| Sitio público | Existe, pero históricamente ha explicado arquitectura más que valor | REMAP | Reescribir después del flujo real |
| Datatek Pro | Shell y flujo hasta autorización parcialmente conectados | COMPLETE | Convertir en operación persistente completa |
| Datatek Pass | Concepto diferenciador; mezcla histórica de fixtures/real en cortes previos | REMAP | Reconstruir sobre ownership y datos reales |
| Datatek Market | Demostrativo, sin conversión ni transacción madura | DEFER | Mantener directorio fundador mínimo |
| Datatek Control | Frontera correcta para gobierno | KEEP / COMPLETE | Validar seguridad y observabilidad |
| `/a/[token]` | Buen patrón de acceso limitado; requiere evidencia productiva | KEEP / COMPLETE | Validar tokens, expiración, bloqueo y revocación |

---

## 3. Dominio y arquitectura

| Área | Estado conocido | Clasificación preliminar |
|---|---|---|
| Monorepo modular | Implementado | KEEP |
| Monolito modular | Decisión vigente | KEEP |
| Organizaciones y sucursales | Modeladas | KEEP |
| Roles y permisos | Catálogo amplio y aditivo | KEEP |
| Tenancy | Diseñada | KEEP |
| RLS | SQL y pruebas escritas; requiere evidencia contra DB viva | COMPLETE |
| Clientes | Implementados en motor y migraciones | KEEP / COMPLETE |
| Vehículos | Entidad global con grants/ownership | KEEP |
| Caso verificable | Núcleo correcto | KEEP |
| Agenda | Incluye anti-colisión en motor | KEEP / COMPLETE |
| Inspección de frenos | Vertical inicial implementada | KEEP / COMPLETE |
| Evidencia | Modelada | KEEP / COMPLETE |
| Cotización versionada | Implementada | KEEP |
| Freeze/hash | Implementado | KEEP |
| Autorización por token | Implementada en motor/UI parcial | KEEP / COMPLETE |
| Eventos y auditoría | Modelados | KEEP / COMPLETE |
| Outbox e idempotencia | Modelados | KEEP / COMPLETE |
| Documentos | Modelados | KEEP / COMPLETE |
| Catálogo de productos | Introducido en v3.x | KEEP / REMAP |
| Corrección/disputa de historial | Introducido en v3.3 | KEEP |

---

## 4. Estado del flujo canónico

| Etapa | Estado preliminar |
|---:|---|
| Entrada | Parcial |
| Recepción | Parcial |
| Identificación del vehículo | Implementada en motor |
| Intake | Implementado |
| Caso | Implementado |
| Agenda/check-in | Agenda implementada; check-in por validar |
| Asignación | Parcial |
| Inspección | Frenos implementado |
| Evidencia | Implementada en contrato/motor |
| Hipótesis | No confirmada como entidad completa |
| Pruebas | No confirmadas como entidad canónica genérica |
| Mediciones | Parcial dentro de inspección |
| Hallazgos | Modelados parcialmente |
| Recomendaciones | Parciales |
| Cotización | Implementada |
| Congelamiento | Implementado |
| Autorización | Implementada en motor/UI parcial |
| Orden de trabajo | Incompleta |
| Ejecución | Incompleta |
| Uso de repuestos | Catálogo inicial; consumo por orden incompleto |
| Verificación | Incompleta |
| Control de calidad | Incompleto |
| Entrega | Incompleta |
| Garantía | Incompleta |
| Actualización de Pass | Parcial |
| Seguimiento | Incompleto |
| Reincidencia | Incompleta |
| Aprendizaje agregado | No operativo |

---

## 5. Evidencia conocida

### Respaldado por commits previos

- motor de comandos para CRM, vehículos, intake, agenda, inspección, cotización y autorización;
- decenas de comandos canónicos;
- pruebas de dominio reportadas en verde en cortes anteriores;
- build reportado limpio en cortes anteriores;
- migraciones SQL escritas;
- escenarios Playwright escritos;
- correcciones de fugas entre organizaciones encontradas durante el desarrollo;
- corrección del escaneo de Tailwind para `packages/ui`;
- catálogo inicial de productos;
- permisos de disputa y corrección histórica.

### Aún no debe considerarse probado para R1

- instalación limpia desde el baseline;
- ejecución completa de migraciones en PostgreSQL real;
- pgTAP en base viva;
- E2E en navegador ejecutable;
- auth productiva;
- persistencia productiva de los comandos;
- aislamiento completo entre dos tenants contra DB viva;
- backup/restore;
- experiencia de operación real de DTEK.

---

## 6. Riesgos P0 iniciales

1. Documentación desfasada respecto del código.
2. Estado en memoria o fixtures mezclados con superficies reales.
3. Persistencia productiva no demostrada de punta a punta.
4. Autenticación de Pass históricamente incompleta.
5. RLS escrita pero no aceptada todavía con evidencia viva para R1.
6. E2E escrito pero no ejecutado en el entorno anterior.
7. Posible acumulación de rutas planificadas visibles.
8. Tratamiento de fechas en `America/Guatemala` debe revalidarse.
9. Rutas inválidas y no enumeración deben revalidarse.
10. README y handoffs pueden inducir a una IA a reconstruir o retroceder el proyecto.
11. El flujo termina demasiado pronto en autorización.
12. Market puede distraer recursos del circuito principal.

---

## 7. Matriz preliminar

### KEEP

- monorepo;
- fronteras de aplicaciones;
- organizaciones;
- sucursales;
- roles;
- permisos;
- modelo de vehículo y grants;
- caso verificable;
- cotización versionada;
- freeze/hash;
- autorización limitada;
- eventos;
- auditoría;
- idempotencia;
- corrección histórica.

### REMAP

- timeline hacia columna vertebral del vehículo;
- inspección hacia sesión diagnóstica estructurada;
- hallazgos hacia relaciones con prueba/medición;
- catálogo hacia servicios, piezas y procedimientos;
- Pass hacia expediente verificable y control de visibilidad;
- sitio público hacia promesa comercial real.

### COMPLETE

- auth;
- persistencia;
- RLS viva;
- orden de trabajo;
- workspace mecánico;
- ejecución;
- consumo de repuestos;
- calidad;
- entrega;
- garantía;
- seguimiento;
- reincidencia;
- observabilidad;
- E2E.

### REPLACE

- fallbacks que devuelvan fixtures ante IDs inválidos;
- cualquier permiso aplicado solo en cliente;
- navegación que exponga funciones inexistentes;
- estados que aparenten éxito sin persistencia.

### DEFER

- feed social;
- marketplace masivo;
- academia extensa;
- seguros;
- financiamiento;
- telemática propia;
- API pública general;
- contabilidad enterprise completa.

### DELETE

Pendiente de inventario real. No se elimina nada únicamente por intuición.

---

## 8. Próxima evidencia requerida

Para elevar este documento de borrador a mapa aceptado:

1. obtener checkout ejecutable de `remaster/r1`;
2. correr las puertas completas;
3. inspeccionar estructura y conteos reales;
4. ejecutar migraciones y pgTAP;
5. ejecutar E2E;
6. actualizar cada fila con `verified`, `partial`, `blocked` o `failed`;
7. adjuntar comandos, logs y hashes;
8. cerrar contradicciones documentales.

---

## 9. Estado del arranque

- [x] Baseline confirmado.
- [x] Rama `remaster/r1` creada.
- [x] Referencia `baseline/pre-remaster-r1` creada.
- [x] Issue #1 creado.
- [x] Baseline normativo incorporado a la rama.
- [x] Current State Map inicial creado.
- [ ] Checkout ejecutable disponible.
- [ ] Puertas técnicas ejecutadas.
- [ ] Base viva validada.
- [ ] E2E ejecutado.
