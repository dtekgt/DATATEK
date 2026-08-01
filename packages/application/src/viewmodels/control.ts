import type { DemoMarker } from "./shared";

export interface ControlCheck {
  id: string;
  label: string;
  status: "demo" | "planned";
  detail: string;
}

export interface ControlStatusViewModel extends DemoMarker {
  generatedAt: string;
  checks: ControlCheck[];
}
