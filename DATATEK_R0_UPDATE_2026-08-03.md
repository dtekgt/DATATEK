# DATATEK R0 — actualización de producto

**Fecha:** 2026-08-03  
**Resultado:** lista para desplegar, con el contrato R0 preservado.

## Qué cambió

- El sitio público dejó de hablar como documento técnico y ahora explica con claridad qué hacen Datatek Pro, Pass y Market.
- El sistema visual adopta el lenguaje táctil del diseño entregado: superficies grafito, relieve medido, pozos de entrada, radios consistentes, rojo DATATEK y acentos Motorsport.
- La navegación pública y de Market funciona mejor en móvil, con destinos prioritarios y controles táctiles de al menos 44 px.
- Pass ya no mezcla el vehículo estático de demostración con el estado real de la sesión. El riel del vehículo y el contenido ahora nacen de la misma consulta.
- Las fechas visibles se formatean explícitamente para `America/Guatemala`; una fecha de calendario ya no retrocede un día por conversión UTC.
- Pro incorpora la acción operativa que faltaba para revocar una solicitud de autorización y generar un enlace nuevo, con motivo obligatorio, permiso de servidor y enlace visible una sola vez.
- El escenario E2E de reenvío usa ahora la interfaz real de Pro, en lugar de un atajo de desarrollo.

## Verificación ejecutada

| Control | Resultado |
| --- | --- |
| TypeScript | OK |
| Lint | OK; quedan 2 advertencias históricas de `console` en el generador de especificación |
| Build de todos los paquetes y apps | OK |
| Pruebas unitarias e integración | **420/420** |
| Formato | OK |
| Especificación generada | OK |
| Aislamiento del legado DTEKPro | OK |
| Reconciliación de rutas, estados y RLS | OK |
| Contrato estático de base de datos | OK |
| Matriz E2E | 28 escenarios detectados; ejecución pendiente de un entorno con Chromium/WebKit disponibles |

## Límites que siguen siendo honestos

- R0 termina en la decisión de autorización. No se presenta como reparación ejecutada, pago procesado o integración productiva.
- La prueba `db:reset` + pgTAP todavía requiere Docker/Postgres local; el contrato estático sí pasó.
- La comprensión con clientes y personal real de taller sigue siendo evidencia humana pendiente.
- Los envíos de autorización continúan marcados como simulados mientras no exista un proveedor de mensajería productivo.

## Criterio de salida

Esta actualización puede publicarse sin ampliar el alcance de R0. Para declarar un siguiente hito productivo harán falta, como mínimo, autenticación real, ejecución de pgTAP sobre Postgres, mensajería conectada y validación de usabilidad con usuarios reales.
