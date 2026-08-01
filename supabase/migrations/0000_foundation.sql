-- Datatek — migración 0000: fundación local.
--
-- Alcance de R0-B (B1–B5): este archivo es un artefacto AUTORIZADO PERO NO
-- EJECUTADO en esta sesión. Supabase local (B6) queda explícitamente diferido
-- a una sesión futura con Docker Desktop disponible. `pnpm db:start` /
-- `db:reset` lo señalan honestamente (ver scripts/db-stub.mjs).
--
-- Esta migración NO crea tablas de negocio. Solo extensiones, un schema
-- privado, un helper seguro de `updated_at` y defaults seguros, tal como
-- exige R0-B sección 4 (B6) y la ley 27 (RLS, grants, índices y pruebas
-- nacen con cada ola; no se agregan al final — la primera ola no tiene
-- negocio que asegurar todavía).

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- Schema privado para funciones internas de plataforma (no de negocio).
create schema if not exists datatek_platform;

-- Helper de `updated_at` seguro: search_path fijo, sin dependencia de
-- variables de sesión mutables (ley 28 aplica a toda función security
-- definer futura; este helper NO es security definer y no toca negocio).
create or replace function datatek_platform.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function datatek_platform.set_updated_at() is
  'Trigger helper: stamps updated_at = now() on row update. No business table uses it yet in R0-B.';

comment on schema datatek_platform is
  'Platform-internal helpers. Business schemas and RLS-protected tables ship starting R0-C/R0-D, one wave at a time.';
