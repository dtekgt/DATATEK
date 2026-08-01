import { Badge, Card, LinkButton } from "@datatek/ui";
import { FIXTURE_ORGANIZATIONS } from "@datatek/application";

// R0-C: Control's minimal organization list is metadata only (id, slug,
// label) — never a generic row/SQL editor (sección 5.4). Opening a specific
// organization's tenant content requires an active support access session;
// see organizations/[organizationId]/page.tsx.
export default function OrganizationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Organizaciones</h1>
        <Badge tone="neutral">metadata de plataforma</Badge>
      </div>
      <p className="text-sm text-[var(--color-muted-400)]">
        Lista mínima de organizaciones registradas. Ver contenido de un tenant específico exige una
        sesión de soporte elevada, con ticket y razón.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIXTURE_ORGANIZATIONS.map((org) => (
          <Card key={org.id}>
            <p className="text-sm font-semibold">{org.label}</p>
            <p className="text-xs text-[var(--color-muted-400)]">/{org.slug}</p>
            <p className="mt-1 text-xs text-[var(--color-muted-400)]">{org.meta}</p>
            <LinkButton
              href={`/organizations/${org.id}`}
              variant="secondary"
              size="sm"
              className="mt-3"
            >
              Ver detalle
            </LinkButton>
          </Card>
        ))}
      </div>
    </div>
  );
}
