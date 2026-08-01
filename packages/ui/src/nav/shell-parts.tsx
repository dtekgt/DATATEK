import type { ReactNode } from "react";
import { ChevronDown, Menu, ShieldAlert, X } from "lucide-react";
import { cn } from "../utils/cn";
import { ForbiddenState, PlannedFeatureState, LoadingState } from "../states/states";
import type { PlannedDetail } from "@datatek/domain";
import type { AccessBoundaryState } from "@datatek/auth";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
}

export interface SidebarProps {
  items: NavItem[];
  collapsed: boolean;
  onToggle: () => void;
  brand: ReactNode;
}

/** Pro desktop sidebar — 272px expanded, collapsible to 72px (sección 7). */
export function Sidebar({ items, collapsed, onToggle, brand }: SidebarProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "hidden shrink-0 flex-col border-r border-white/8 bg-[var(--color-ink-900)] py-4 transition-[width] duration-[var(--duration-base)] md:flex",
        collapsed ? "w-[72px]" : "w-[272px]",
      )}
    >
      <div className="flex items-center justify-between px-4">
        {!collapsed ? brand : null}
        <button
          type="button"
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          onClick={onToggle}
          className="focus-ring tap-target rounded-[var(--radius-control)] p-2 text-[var(--color-muted-400)] hover:bg-white/5"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <ul className="mt-4 flex flex-col gap-1 px-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "focus-ring tap-target flex items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium",
                item.active
                  ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]"
                  : "text-[var(--color-muted-400)] hover:bg-white/5 hover:text-[var(--color-paper-50)]",
              )}
            >
              <span aria-hidden>{item.icon}</span>
              {!collapsed ? <span>{item.label}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface TopbarProps {
  title: string;
  actions?: ReactNode;
  onOpenMobileNav?: () => void;
}

export function Topbar({ title, actions, onOpenMobileNav }: TopbarProps) {
  return (
    <header className="flex h-16 items-center gap-3 border-b border-white/8 bg-[var(--color-ink-900)] px-4">
      {onOpenMobileNav ? (
        <button
          type="button"
          aria-label="Abrir navegación"
          onClick={onOpenMobileNav}
          className="focus-ring tap-target rounded-[var(--radius-control)] p-2 md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
      <h1 className="truncate text-base font-semibold">{title}</h1>
      <div className="ml-auto flex items-center gap-2">{actions}</div>
    </header>
  );
}

export interface BottomNavItem {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      aria-label="Navegación inferior"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/8 bg-[var(--color-ink-900)]/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "focus-ring tap-target flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium",
            item.active ? "text-[var(--color-brand-400)]" : "text-[var(--color-muted-400)]",
          )}
        >
          <span aria-hidden>{item.icon}</span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export interface ContextDrawerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** 360px contextual drawer, only shown when viewport allows (sección 7). */
export function ContextDrawer({ title, open, onClose, children }: ContextDrawerProps) {
  if (!open) return null;
  return (
    <aside
      role="complementary"
      aria-label={title}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[360px] flex-col border-l border-white/8 bg-[var(--color-ink-900)] shadow-2xl lg:static lg:max-w-none lg:border-l lg:shadow-none"
      style={{ width: 360 }}
    >
      <div className="flex items-center justify-between border-b border-white/8 p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Cerrar panel"
          onClick={onClose}
          className="focus-ring tap-target rounded-[var(--radius-control)] p-2 text-[var(--color-muted-400)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

export interface SwitcherOption {
  id: string;
  label: string;
  meta?: string;
}

export interface SwitcherProps {
  label: string;
  options: SwitcherOption[];
  value: string;
  onChange: (id: string) => void;
}

export function OrganizationSwitcher({ label, options, value, onChange }: SwitcherProps) {
  return <LabeledSwitcher label={label} options={options} value={value} onChange={onChange} />;
}

export function BranchSwitcher({ label, options, value, onChange }: SwitcherProps) {
  return <LabeledSwitcher label={label} options={options} value={value} onChange={onChange} />;
}

function LabeledSwitcher({ label, options, value, onChange }: SwitcherProps) {
  return (
    <label className="flex items-center gap-2 rounded-[var(--radius-control)] border border-white/10 bg-[var(--color-surface-800)] px-3 py-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring bg-transparent text-sm text-[var(--color-paper-50)]"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
            {opt.meta ? ` · ${opt.meta}` : ""}
          </option>
        ))}
      </select>
      <ChevronDown className="h-4 w-4 text-[var(--color-muted-400)]" aria-hidden />
    </label>
  );
}

export interface AccessBoundaryProps {
  /**
   * The real access decision, computed server-side by
   * `resolveAccessBoundaryState` in `@datatek/auth` from membership, roles,
   * branch scope, and elevation state. This component never decides
   * anything on its own ("el componente presenta; el servidor decide" —
   * DATATEK_R0_C sección 9) — it only renders whichever of the 8 states it
   * is given.
   */
  state: AccessBoundaryState;
  children: ReactNode;
}

/** Renders one of the 8 states from DATATEK_R0_C sección 9. */
export function AccessBoundary({ state, children }: AccessBoundaryProps) {
  switch (state.kind) {
    case "loading_session":
      return <LoadingState label="Verificando tu sesión…" />;
    case "unauthenticated":
      return <ForbiddenState reason="Necesitas iniciar sesión para ver esta sección." />;
    case "membership_missing":
      return (
        <ForbiddenState reason="No perteneces a esta organización todavía. Pide una invitación a quien administra el taller." />
      );
    case "membership_expired":
      return (
        <ForbiddenState reason="Tu acceso a esta organización venció o fue revocado. Contacta a quien administra el taller." />
      );
    case "branch_denied":
      return (
        <ForbiddenState
          reason="No tienes acceso a esta sucursal."
          requiredPermission={`branch:${state.branchId}`}
        />
      );
    case "capability_denied":
      return (
        <ForbiddenState
          reason="No tienes el permiso necesario para ver esta sección."
          requiredPermission={state.permission}
        />
      );
    case "elevation_required":
      return (
        <ForbiddenState
          reason="Esta información pertenece a un tenant. Necesitas una sesión de soporte elevada, con ticket y razón, para leerla."
          requiredPermission={`elevation:${state.organizationId}`}
        />
      );
    case "allowed":
      return <>{children}</>;
  }
}

export interface PermissionGateProps {
  /** Fixture flag — see AccessBoundary. */
  hasPermission: boolean;
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({
  hasPermission,
  permission,
  children,
  fallback,
}: PermissionGateProps) {
  if (!hasPermission) {
    return fallback ?? <ForbiddenState requiredPermission={permission} />;
  }
  return <>{children}</>;
}

export interface FeatureGateProps {
  /** Fixture flag from static config, not a real flag service in R0-B. */
  enabled: boolean;
  featureTitle: string;
  planned: PlannedDetail;
  children: ReactNode;
}

export function FeatureGate({ enabled, featureTitle, planned, children }: FeatureGateProps) {
  if (!enabled) {
    return <PlannedFeatureState title={featureTitle} detail={planned} />;
  }
  return <>{children}</>;
}

export interface ElevatedAccessBannerProps {
  active: boolean;
  actorLabel: string;
  /** Human label for the tenant being read under elevation. */
  organizationLabel?: string;
  ticket?: string;
  reason?: string;
  /** ISO 8601 expiry — rendered so support can see when the window closes. */
  expiresAt?: string;
}

/** Ley 19: soporte necesita sesión elevada vigente para leer datos de un
 * tenant. Shows tenant, ticket, reason and expiration (sección 5.4) — never
 * just "active/inactive". */
export function ElevatedAccessBanner({
  active,
  actorLabel,
  organizationLabel,
  ticket,
  reason,
  expiresAt,
}: ElevatedAccessBannerProps) {
  if (!active) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--color-warning-400)]/40 bg-[var(--color-warning-400)]/10 px-4 py-2 text-sm text-[var(--color-warning-400)]"
    >
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
      <span>
        Sesión elevada activa para <strong>{actorLabel}</strong>
        {organizationLabel ? (
          <>
            {" "}
            sobre <strong>{organizationLabel}</strong>
          </>
        ) : null}
        {ticket ? <> · ticket {ticket}</> : null}
        {reason ? <> · {reason}</> : null}
        {expiresAt ? <> · vence {new Date(expiresAt).toLocaleString("es-GT")}</> : null}
      </span>
    </div>
  );
}
