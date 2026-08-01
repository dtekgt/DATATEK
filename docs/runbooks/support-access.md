# Runbook — acceso elevado de soporte (Control)

## Qué es

`support_access_sessions` (migración `0010`) es la única forma de que un
actor de plataforma (`platform_memberships`) lea contenido de un tenant
específico desde Datatek Control. Entrar a Control (tener
`platform.control.enter`) y abrir datos de una organización son decisiones
**separadas** (sección 2.5) — la segunda siempre exige una sesión elevada
activa.

No existe acceso global perpetuo a contenido tenant. No hay editor SQL ni
"fila genérica" en Control (sección 5.4): cada mutación es un comando con
razón.

## Campos obligatorios de una sesión elevada

| Campo | Obligatorio | Notas |
|---|---|---|
| `platform_membership_id` | sí | debe estar `active` y vigente |
| `organization_id` | sí | el tenant objetivo exacto |
| `ticket` | sí | referencia externa (helpdesk) |
| `reason` | sí | texto libre, no vacío |
| `scope` | sí | `read_only` o `read_write_support` |
| `starts_at` / `expires_at` | sí | `expires_at > starts_at`, sin excepción |
| `approved_by` | según política | actor aprobador cuando la organización lo exige |
| `status` | sí | `pending` → `active` → `revoked`/`expired` |

## Ciclo de vida

1. Un actor con `platform.access.request` crea la fila (`status: pending`).
2. Un actor con `platform.access.approve` la activa (`status: active`,
   `approved_by` = su propio user id). En R0-C esto se seed-ea ya activo
   (ver `docs/runbooks/local-auth-seeds.md`); el flujo de aprobación real es
   R0-D+.
3. Mientras `status = active`, `revoked_at is null` y `now()` está entre
   `starts_at` y `expires_at`,
   `datatek_platform.has_active_support_session(organization_id)` devuelve
   `true` para ese actor — y solo para ese actor y esa organización.
4. Al vencer `expires_at`, o al escribir `revoked_at`/`status = revoked`, el
   acceso se corta inmediatamente en la siguiente consulta — no hay cache de
   sesión elevada del lado del servidor que sobreviva al vencimiento.

## Qué se ve en Control sin elevación

Sin una sesión activa sobre una organización, Control solo muestra metadata
de plataforma ya autorizada: lista de organizaciones (nombre, slug, estado),
usuarios de plataforma, catálogo global, feature flags, seguridad, auditoría
de plataforma. **Ningún dato de negocio de un tenant** (cuando exista, desde
R0-D) es legible sin elevación — la sección 5.4 lo prohíbe explícitamente.

`ElevatedAccessBanner` (`packages/ui/src/nav/shell-parts.tsx`) es el único
lugar de la UI que muestra que una sesión de este tipo está activa: tenant,
ticket, razón y vencimiento, siempre visible mientras dure — nunca un simple
`active: true/false` sin contexto.

## Verificación manual local (fixtures, sin Docker)

Con `pnpm dev` corriendo, en `apps/control`:

1. Iniciar sesión como `Soporte de plataforma` (ver
   `docs/runbooks/local-auth-seeds.md`).
2. La fixture trae una sesión elevada ya activa sobre DTEK Servicios
   (`sas-support-dtek`, ticket `TCK-1042`) — el banner debe mostrarla.
3. Cambiar el actor fixture a `Soporte de plataforma` sobre Taller Demo (sin
   sesión elevada seed-ada): el intento de leer ese tenant debe resultar en
   `elevation_required`, no en datos.

## Verificación real (pendiente de Docker/Postgres)

`supabase/tests/0010_identity_tenancy.sql` casos 9–12 cubren, bajo RLS real:
platform support entra a Control; sin elevación no lee Taller Demo; con
sesión seed-ada sí lee DTEK; una sesión con `expires_at` pasado deja de
contar aunque siga en `status = active`. Estos casos están escritos y
revisados pero no ejecutados en esta sandbox
(`implemented_pending_environment_evidence`) — ver
`docs/runbooks/database-reset.md`.
