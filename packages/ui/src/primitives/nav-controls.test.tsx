import "../../test-setup/jsdom-env";
import { describe, it } from "node:test";
import { expect } from "expect";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./nav-controls";

describe("Tabs", () => {
  it("moves focus and selection with arrow keys", async () => {
    const user = userEvent.setup();
    render(
      <Tabs
        ariaLabel="Ejemplo"
        items={[
          { id: "a", label: "Uno", content: <p>Contenido uno</p> },
          { id: "b", label: "Dos", content: <p>Contenido dos</p> },
        ]}
      />,
    );
    const first = screen.getByRole("tab", { name: "Uno" });
    first.focus();
    expect(first).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    const second = screen.getByRole("tab", { name: "Dos" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
  });
});
