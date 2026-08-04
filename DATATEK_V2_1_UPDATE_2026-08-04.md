# DATATEK v2.1 — accesos claros y apertura de casos

Fecha: 2026-08-04 (America/Guatemala)

## Resultado

Esta entrega separa de forma visible y funcional los espacios del taller y del conductor:

- **Pro** es el espacio privado del taller para abrir y operar casos.
- **Pass** es el espacio del conductor para entender, decidir y consultar su historial.
- Solo la información aprobada para el cliente cruza de Pro a Pass.
- Las notas internas y los controles del taller nunca se muestran en Pass.

## Cambios funcionales

- Apertura guiada y atómica de casos desde Pro.
- Alta o reutilización de cliente y vehículo en el mismo recorrido.
- Validación de que un vehículo existente pertenezca al cliente y organización correctos.
- Reversión completa si cualquier dato del recorrido es inválido.
- Tablero Pro conectado al estado real de la sesión de demostración.
- Rutas funcionales de clientes y vehículos, con detalle e historial de casos.
- Etiquetas y textos inequívocos en portada, Pro, Pass y acceso de demostración.

## Verificación

- TypeScript: aprobado.
- Lint: aprobado, sin errores.
- Formato: aprobado.
- Build de producción: aprobado.
- Contrato y reconciliación R0: aprobados.
- Pruebas unitarias y de integración: **424/424 aprobadas**.
- Rutas funcionales: 32.
- Rutas planificadas: 24.

## Límite declarado

La separación de producto, navegación, autorización y datos ya existe. El acceso publicado sigue siendo una sesión de demostración temporal en memoria; la autenticación real y la persistencia en Postgres corresponden al siguiente corte antes de operar con datos reales de talleres o conductores.
