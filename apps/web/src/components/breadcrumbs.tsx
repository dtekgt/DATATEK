export function Breadcrumbs({ items }: { items: string[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="text-xs text-[var(--color-muted-400)]">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={item} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden>/</span> : null}
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
