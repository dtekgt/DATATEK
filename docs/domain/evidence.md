# Evidencia (R0-D Fase 2, ola `0070`)

Fuente normativa: `DATATEK_R0_D_BRAKES_AUTHORIZATION_VERTICAL.md` sección
10 y `DATATEK_R0_A_CONTRACT_PACK.md` sección 8 completa (contrato exacto
del ciclo de evidencia). Cubre los 3 comandos de evidencia en
`packages/application/src/commands/inspection-commands.ts`
(`CreateUploadIntent`, `ConfirmEvidenceUpload`, `LinkEvidence`) y la regla
de visibilidad de `packages/domain/src/evidence/visibility.ts`.

## Estado de la migración

`upload_intents`, `evidence_assets`, `evidence_links` viven en
`supabase/migrations/0070_inspection_evidence.sql` junto a las tablas de
inspección — mismo estado "escrito, no ejecutado" documentado en
`brakes-slice.md`.

## El ciclo en tres pasos

1. **`CreateUploadIntent`** — valida caso/actor/propósito/visibilidad
   solicitada y asigna `bucket`/`objectPath` ANTES de que exista ningún
   archivo. El path es generado por el servidor
   (`${organizationId}/${caseId}/${cryptoRandomId()}`), nunca derivado de
   un nombre de archivo o de un id secuencial — "paths no adivinables"
   (sección 10). `expiresAt` es corto (15 minutos por defecto,
   configurable) — un intent que expira sin confirmarse queda `pending`
   para siempre en el motor en memoria (el job de limpieza de huérfanos es
   una fase posterior), y es precisamente ese estado el que
   `CompleteInspection` detecta como "evidencia requerida sin confirmar"
   (`brakes-slice.md`).
2. **`ConfirmEvidenceUpload`** — el único comando que crea una fila
   `evidence_assets`. Exige que el intent exista, esté `pending` (no ya
   `confirmed`) y no haya expirado; recibe MIME detectado, tamaño y hash
   ya calculados por el llamador (el motor en memoria no hace detección de
   contenido real) y los persiste junto con `visibilityMax`, fijado
   **igual a** `uploadIntent.visibilityRequested` — este es el techo que
   ningún link posterior puede ampliar.
3. **`LinkEvidence`** — vincula un asset ya confirmado a
   `case`/`inspection_result`/`finding` con su PROPIA `visibility`
   solicitada. El link se guarda tal cual (igual que la columna
   `evidence_links.visibility` en SQL); el comando además calcula y
   devuelve `effectiveVisibility` en su output (no persistido — el mismo
   cálculo puede repetirse en cualquier query futura sin re-derivar la
   regla).

## Visibilidad efectiva: siempre la más restrictiva

`packages/domain/src/evidence/visibility.ts` (`effectiveEvidenceVisibility`)
es la única fuente de verdad de "la visibilidad efectiva siempre es la más
restrictiva" (sección 8.3): `internal` < `shared_case` < `customer` en
orden de apertura, y el resultado es siempre el MENOR de
`asset.visibilityMax` y `link.visibility`. `LinkEvidence` invoca esta
función directamente — nunca reimplementa la comparación.

Consecuencia demostrada en
`packages/application/src/commands/inspection-commands.test.ts`
(`"LinkEvidence — visibility never widens"`):

- un asset confirmado con `visibilityRequested: "internal"` vinculado con
  `visibility: "customer"` produce `effectiveVisibility: "internal"` — un
  link incorrecto **no puede** volver pública una evidencia interna;
- un asset `customer` vinculado con `visibility: "internal"` también
  produce `effectiveVisibility: "internal"` — el link puede restringir
  aún más, nunca ampliar.

## Lo que este comando NO hace todavía

- No hay endpoint de subida real ni storage local — `bytes`/`hash`/
  `mimeDetected` llegan como input ya calculado por el llamador (el
  contrato de sección 10 — "Storage privado local... hash; MIME
  detectado; tamaño" — se cumple a nivel de forma de dato, no de
  infraestructura real, en esta fase).
- No hay job de limpieza de huérfanos (`upload_intents` `pending`
  vencidos) — documentado como pendiente, mismo patrón que
  `case_blockers` en `case-lifecycle.md`.
- No hay proyección "visible a Pass" que filtre por `effectiveVisibility`
  — un query contract de fase futura, igual que `case_notes` con
  `visibility: internal` (ver `case-lifecycle.md`). La RLS de base en
  `0070_inspection_evidence.sql` protege aislamiento de tenant
  (`evidence.read_internal`), no sustituye ese filtro.
- `replaces_asset_id` (evidencia reemplazada conserva referencia, sección
  8.2) — columna modelada en `EvidenceAssetRow`/SQL, sin comando que la
  escriba todavía.
