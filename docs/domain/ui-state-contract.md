# Contrato de estados de interfaz

Fuente: `packages/ui/src/states/states.tsx`.

R0-B exige que toda pantalla tenga una respuesta honesta para cada situación
posible, no solo para el camino feliz. Estos son los estados compartidos y
cuándo usarlos.

| Componente | Cuándo se usa | Nunca hace |
|---|---|---|
| `LoadingState` | Mientras se resuelve un ViewModel. | Bloquear indefinidamente sin `role="status"`. |
| `EmptyState` | Colección vacía legítima (p. ej. sin casos abiertos). | Presentarse como error. |
| `ErrorState` | Falla técnica recuperable, con opción de reintentar. | Inventar una causa específica sin saberla. |
| `ForbiddenState` | `AccessBoundary`/`PermissionGate` deniegan acceso. | Revelar por qué de forma que filtre datos de otro tenant. |
| `PlannedFeatureState` | Ruta o control sin implementación real (ley 29). | Simular éxito o mostrar un botón que mute algo. |
| `ConflictState` | El dato que el usuario ve cambió en el servidor. | Sobrescribir en silencio. |
| `CommandResult` | Resultado de una acción — `status: "noop"` cuando R0-B no puede ejecutarla de verdad. | Reportar `"success"` sin backend real. |
| `ConnectionStatus` | Indicador de conexión en Pass (PWA). | Prometer envío offline de datos sensibles. |
| `FriendlyErrorState` | Errores complejos que necesitan explicar qué pasó, qué quedó intacto y qué hacer (ley 46). | Mostrar solo un código o stack trace como explicación principal. |
| `TechnicalDetailDisclosure` | Detalle técnico bajo demanda (ley 44), p. ej. hash de cotización o permiso requerido. | Ser la primera capa de explicación. |

## Reglas transversales

1. **Ninguna fixture se presenta sin `demo: true` y badge visible.** Todo
   ViewModel de `packages/application` extiende `DemoMarker` (`{ demo: true
   }`); los componentes de `packages/ui/src/domain/pass.tsx` (`VehicleNowCard`,
   etc.) muestran el badge `DEMO DATA` cuando `vm.demo` es verdadero.
2. **Ningún estado de éxito se muestra sin backend real.** `CaseProofSummary`
   fija `completedSuccessfully: false` en el tipo del ViewModel — no es un
   valor que un adapter pueda cambiar a `true` en R0-B.
3. **Un precio nunca se renderiza sin modalidad.** `PricingBasisBadge` es el
   único componente autorizado a mostrar un monto; siempre recibe un
   `PriceModality` con `mode` declarado.
4. **Como máximo tres decisiones inmediatas.** `ImmediateDecisionStack` hace
   `slice(0, 3)` sobre el arreglo completo del ViewModel; el fixture de
   prueba (`FIXTURE_DECISIONS_FOUR`) tiene 4 elementos a propósito para que
   el test pruebe el límite.
5. **`VehicleContextRail` nunca muestra un porcentaje global de salud.**
   `VehicleNowViewModel.globalHealthScore` es literalmente el tipo `null` —
   no existe forma de poblarlo con un número.
6. **Lo desconocido no es "sin alertas".** `unknown` y `no_current_alerts`
   son estados de `VehicleNowStatus` distintos, con copy y color distintos.

## Verificación

`packages/ui/src/states/states.test.tsx`,
`packages/ui/src/domain/pass.test.tsx` y
`packages/ui/src/nav/shell-parts.test.tsx` cubren: `PlannedFeatureState`
explica los cuatro campos obligatorios; `FriendlyErrorState` explica qué
pasó/qué quedó intacto/qué hacer; `ImmediateDecisionStack` nunca renderiza
más de 3; `VehicleNowCard` distingue `unknown` de `no_current_alerts` y
nunca imprime un `%`; `PricingBasisBadge` siempre imprime la etiqueta de
modalidad; `AccessBoundary` oculta children cuando `allowed=false`.
