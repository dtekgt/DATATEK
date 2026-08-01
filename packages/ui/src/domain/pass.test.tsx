import "../../test-setup/jsdom-env";
import { describe, it } from "node:test";
import { expect } from "expect";
import { render, screen } from "@testing-library/react";
import { ImmediateDecisionStack, VehicleNowCard, PricingBasisBadge } from "./pass";
import type { ImmediateDecisionViewModel, VehicleNowViewModel } from "@datatek/application";

describe("ImmediateDecisionStack", () => {
  it("never renders more than 3 decisions even when 4 are provided", () => {
    const vm: ImmediateDecisionViewModel = {
      demo: true,
      vehicleId: "veh-1",
      decisions: [
        { id: "1", title: "Uno", description: "d1", dueBy: null, href: "#" },
        { id: "2", title: "Dos", description: "d2", dueBy: null, href: "#" },
        { id: "3", title: "Tres", description: "d3", dueBy: null, href: "#" },
        { id: "4", title: "Cuatro", description: "d4", dueBy: null, href: "#" },
      ],
    };
    render(<ImmediateDecisionStack vm={vm} />);
    expect(screen.getByText("Uno")).toBeInTheDocument();
    expect(screen.getByText("Dos")).toBeInTheDocument();
    expect(screen.getByText("Tres")).toBeInTheDocument();
    expect(screen.queryByText("Cuatro")).not.toBeInTheDocument();
    expect(screen.getByText(/1 decisión\(es\) adicional/i)).toBeInTheDocument();
  });
});

describe("VehicleNowCard", () => {
  it("distinguishes 'unknown' from 'no_current_alerts'", () => {
    const unknown: VehicleNowViewModel = {
      demo: true,
      vehicleId: "v1",
      status: "unknown",
      headline: "Sin datos suficientes",
      detail: null,
      source: "Sin fuente",
      observedAt: null,
      noFindingsIsNotHealthy: true,
      globalHealthScore: null,
    };
    const { rerender } = render(<VehicleNowCard vm={unknown} />);
    expect(screen.getByText("Desconocido")).toBeInTheDocument();

    const healthy: VehicleNowViewModel = {
      ...unknown,
      status: "no_current_alerts",
      headline: "Sin alertas",
    };
    rerender(<VehicleNowCard vm={healthy} />);
    expect(screen.getByText("Sin alertas actuales")).toBeInTheDocument();
  });

  it("never renders a global health percentage", () => {
    const vm: VehicleNowViewModel = {
      demo: true,
      vehicleId: "v1",
      status: "no_current_alerts",
      headline: "Todo en orden",
      detail: null,
      source: "Inspección",
      observedAt: "2026-07-01T00:00:00-06:00",
      noFindingsIsNotHealthy: true,
      globalHealthScore: null,
    };
    render(<VehicleNowCard vm={vm} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe("PricingBasisBadge", () => {
  it("always renders a pricing modality label alongside any amount", () => {
    render(
      <PricingBasisBadge modality={{ mode: "fixed", amount: { amount: 100, currency: "GTQ" } }} />,
    );
    expect(screen.getByText("Precio fijo")).toBeInTheDocument();
  });

  it("renders modality label even when no amount exists yet (inspection/diagnosis)", () => {
    render(
      <PricingBasisBadge
        modality={{ mode: "diagnosis_required", note: "Se requiere diagnóstico" }}
      />,
    );
    expect(screen.getByText("Requiere diagnóstico")).toBeInTheDocument();
  });
});
