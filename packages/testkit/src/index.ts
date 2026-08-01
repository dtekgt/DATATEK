import type { ActorRole } from "@datatek/domain";

/** Simple role fixture for tests — no real auth. */
export interface RoleFixture {
  role: ActorRole;
  label: string;
}

export const ROLE_FIXTURES: Record<ActorRole, RoleFixture> = {
  conductor: { role: "conductor", label: "Conductor (Pass)" },
  taller: { role: "taller", label: "Taller (Pro)" },
  proveedor: { role: "proveedor", label: "Proveedor de repuestos" },
  control: { role: "control", label: "Operador de Control" },
  guest: { role: "guest", label: "Invitado sin cuenta" },
};

export function expectDemoMarker(value: { demo: true }): void {
  if (value.demo !== true) {
    throw new Error("Expected fixture to declare demo: true");
  }
}
