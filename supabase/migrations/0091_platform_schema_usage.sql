-- Datatek — migración 0091: usage sobre datatek_platform para authenticated.
--
-- Corrige un defecto detectado el 2026-08-04, en la primera ejecución real de
-- las migraciones y de pgTAP contra Postgres (antes de esa fecha ninguna
-- migración se había ejecutado nunca; ver docs/runbooks/database-reset.md).
--
-- 0010 otorga `grant execute` sobre las funciones de identidad y tenancy a
-- `authenticated` (líneas 621-629), y 0020/0040/0090 hacen lo mismo con las
-- suyas. Pero ninguna otorga `usage` sobre el schema que las contiene. En
-- Postgres, EXECUTE sin USAGE sobre el schema es inoperante: el rol no puede
-- resolver el nombre y recibe `permission denied for schema`.
--
-- Consecuencia real: `authenticated` no podía invocar has_org_permission,
-- org_branch_scope_allows, has_active_support_session ni actor_is_linked_customer
-- — las funciones sobre las que se apoyan las políticas RLS de tenancy.
--
-- No se modifica 0010: una migración ya aplicada no se reescribe (invariante 4).
--
-- Se concede USAGE, no CREATE, y solo a `authenticated`. `anon` queda fuera a
-- propósito: un visitante sin sesión no resuelve capacidades de organización.

grant usage on schema datatek_platform to authenticated;

comment on schema datatek_platform is
  'Funciones internas de plataforma (identidad, tenancy, capacidades). authenticated tiene USAGE + EXECUTE sobre las funciones concedidas explícitamente; nunca CREATE.';
