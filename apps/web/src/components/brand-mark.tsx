/** Marca D-TEK GT — mismo tratamiento que el guideline "Logo & Wordmark" del
 * design system (claude.ai/design, proyecto D-TEK GT): marca circular +
 * wordmark en peso semibold junto a un subtítulo mudo. El anillo usa el
 * glow de acento LED de la marca (guideline "LED Accent Lines & Glow") en
 * vez del PNG del isotipo para no depender de un asset binario. */
export function BrandMark({
  subtitle,
  className,
}: {
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <span
        aria-hidden
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-ink-950)]"
        style={{ boxShadow: "var(--glow-accent)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-brand-500)]" />
      </span>
      <div className="leading-none">
        <span className="text-sm font-semibold tracking-[0.03em]">D-TEK GT</span>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[var(--color-muted-400)]">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
