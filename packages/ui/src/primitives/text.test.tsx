import "../../test-setup/jsdom-env";
import { describe, it } from "node:test";
import { expect } from "expect";
import { render, screen } from "@testing-library/react";
import { DateTimeText } from "./text";

describe("DateTimeText — America/Guatemala", () => {
  it("preserva una fecha de calendario sin moverla al día anterior", () => {
    render(<DateTimeText value="2026-07-30" />);
    expect(screen.getByText(/30/)).toBeInTheDocument();
    expect(screen.queryByText(/29/)).not.toBeInTheDocument();
  });

  it("convierte un instante UTC a la fecha y hora de Guatemala", () => {
    render(<DateTimeText value="2026-08-01T02:30:00.000Z" mode="datetime" />);
    expect(screen.getByText(/31/)).toBeInTheDocument();
  });
});
