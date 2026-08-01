import "../../test-setup/jsdom-env";
import { describe, it } from "node:test";
import { expect } from "expect";
import { render, screen } from "@testing-library/react";
import { AccessBoundary, ElevatedAccessBanner } from "./shell-parts";
import type { AccessBoundaryState } from "@datatek/auth";

describe("AccessBoundary", () => {
  it("renders children when the state is allowed", () => {
    render(
      <AccessBoundary state={{ kind: "allowed" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.getByText("Contenido protegido")).toBeInTheDocument();
  });

  it("renders a loading state and hides children while the session loads", () => {
    render(
      <AccessBoundary state={{ kind: "loading_session" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders unauthenticated as a forbidden state", () => {
    render(
      <AccessBoundary state={{ kind: "unauthenticated" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    expect(screen.getByText(/iniciar sesión/i)).toBeInTheDocument();
  });

  it("renders membership_missing distinctly from membership_expired", () => {
    const { rerender } = render(
      <AccessBoundary state={{ kind: "membership_missing" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.getByText(/no perteneces a esta organización/i)).toBeInTheDocument();

    rerender(
      <AccessBoundary state={{ kind: "membership_expired" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.getByText(/venció o fue revocado/i)).toBeInTheDocument();
  });

  it("renders branch_denied with the denied branch surfaced as technical detail", () => {
    render(
      <AccessBoundary state={{ kind: "branch_denied", branchId: "branch-norte" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.getByText(/no tienes acceso a esta sucursal/i)).toBeInTheDocument();
    expect(screen.getByText("branch:branch-norte")).toBeInTheDocument();
  });

  it("renders capability_denied with the missing permission surfaced", () => {
    render(
      <AccessBoundary state={{ kind: "capability_denied", permission: "membership.manage" }}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.getByText("membership.manage")).toBeInTheDocument();
  });

  it("renders elevation_required distinctly", () => {
    const state: AccessBoundaryState = { kind: "elevation_required", organizationId: "org-dtek" };
    render(
      <AccessBoundary state={state}>
        <p>Contenido protegido</p>
      </AccessBoundary>,
    );
    expect(screen.getByText(/sesión de soporte elevada/i)).toBeInTheDocument();
  });
});

describe("ElevatedAccessBanner", () => {
  it("renders nothing when not active", () => {
    render(<ElevatedAccessBanner active={false} actorLabel="Soporte" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows tenant, ticket, reason and expiration when active", () => {
    render(
      <ElevatedAccessBanner
        active
        actorLabel="Soporte Datatek"
        organizationLabel="DTEK Servicios"
        ticket="TCK-102"
        reason="Investigar folio 4021"
        expiresAt="2026-08-01T18:00:00.000Z"
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("DTEK Servicios");
    expect(alert).toHaveTextContent("TCK-102");
    expect(alert).toHaveTextContent("Investigar folio 4021");
  });
});
