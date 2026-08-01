import "../../test-setup/jsdom-env";
import { describe, it } from "node:test";
import { expect } from "expect";
import { render, screen } from "@testing-library/react";
import { PlannedFeatureState, FriendlyErrorState, EmptyState } from "./states";

describe("PlannedFeatureState", () => {
  it("explains purpose, dependency, release, data and why it's disabled", () => {
    render(
      <PlannedFeatureState
        title="Bandeja"
        detail={{
          purpose: "Centralizar mensajes",
          dependency: "R0-C",
          release: "r0-c",
          dataToBeUsed: "Solicitudes y mensajes",
          whyDisabled: "Requiere sesión real",
        }}
      />,
    );
    expect(screen.getByText("Centralizar mensajes")).toBeInTheDocument();
    expect(screen.getByText("R0-C")).toBeInTheDocument();
    expect(screen.getByText("Solicitudes y mensajes")).toBeInTheDocument();
    expect(screen.getByText("Requiere sesión real")).toBeInTheDocument();
    expect(screen.getByText(/Planificado/)).toBeInTheDocument();
  });
});

describe("FriendlyErrorState", () => {
  it("explains what happened, what stays intact, and what to do next", () => {
    let retryCalls = 0;
    const onRetry = () => {
      retryCalls += 1;
    };
    render(
      <FriendlyErrorState
        whatHappened="No pudimos guardar el cambio."
        whatStaysIntact="Tu información anterior sigue igual."
        whatToDoNext="Intenta de nuevo en unos minutos."
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("No pudimos guardar el cambio.")).toBeInTheDocument();
    expect(screen.getByText("Tu información anterior sigue igual.")).toBeInTheDocument();
    expect(screen.getByText("Intenta de nuevo en unos minutos.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Reintentar" }).click();
    expect(retryCalls).toBe(1);
  });
});

describe("EmptyState", () => {
  it("renders a title without implying an error", () => {
    render(<EmptyState title="Sin casos abiertos todavía." />);
    expect(screen.getByText("Sin casos abiertos todavía.")).toBeInTheDocument();
  });
});
