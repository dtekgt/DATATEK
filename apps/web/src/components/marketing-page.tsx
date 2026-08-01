import type { ReactNode } from "react";
import { Card } from "@datatek/ui";

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
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-400)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-4 text-base text-[var(--color-muted-400)]">{intro}</p>
      </header>
      {sections && sections.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {sections.map((s) => (
            <Card key={s.title}>
              <h2 className="text-base font-semibold">{s.title}</h2>
              <p className="mt-2 text-sm text-[var(--color-muted-400)]">{s.body}</p>
            </Card>
          ))}
        </div>
      ) : null}
      {children}
    </article>
  );
}
