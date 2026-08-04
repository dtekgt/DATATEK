import type { ReactNode } from "react";
import { Card, Display, Kicker, SectionTitle } from "@datatek/ui";

export interface MarketingSection {
  title: string;
  body: string;
}

export function MarketingPage({
  eyebrow,
  title,
  intro,
  sections,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro: string;
  sections?: MarketingSection[];
  children?: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-8">
      <header className="max-w-2xl">
        {/* Kicker → display → una frase de apoyo apagada. Es la estructura de
            encabezado que el design system repite en cada héroe. */}
        {eyebrow ? <Kicker className="text-[var(--color-brand-400)]">{eyebrow}</Kicker> : null}
        <Display className="mt-3">{title}</Display>
        <p className="mt-5 text-base text-[var(--color-muted-400)]">{intro}</p>
      </header>
      {sections && sections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Card key={s.title}>
              <SectionTitle>{s.title}</SectionTitle>
              <p className="mt-2 text-sm text-[var(--color-muted-400)]">{s.body}</p>
            </Card>
          ))}
        </div>
      ) : null}
      {children}
    </article>
  );
}
