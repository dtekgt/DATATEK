import { ArrowRight, CarFront, Check, FileCheck2, Search, ShieldCheck, Wrench } from "lucide-react";
import { Badge, Card, Display, Kicker, LinkButton, SectionTitle } from "@datatek/ui";

const promises = [
  "Datos de demostración claramente rotulados",
  "Separación segura entre talleres",
  "Una sola versión autorizable de cada cotización",
];

const products = [
  {
    name: "Datatek Pro",
    audience: "Para el taller",
    description:
      "Casos, agenda, inspección, evidencia y cotizaciones en una sola operación. Cada caso muestra qué sigue y quién debe hacerlo.",
    href: "/pro",
    icon: Wrench,
    accent: "brand" as const,
  },
  {
    name: "Datatek Pass",
    audience: "Para el conductor",
    description:
      "El estado del vehículo explicado sin lenguaje enredado, decisiones pendientes a la vista y un historial que no se pierde.",
    href: "/pass",
    icon: CarFront,
    accent: "info" as const,
  },
  {
    name: "Datatek Market",
    audience: "Para conectar",
    description:
      "Descubre talleres y servicios con precios que siempre explican si son fijos, desde, por rango o sujetos a diagnóstico.",
    href: "/market",
    icon: Search,
    accent: "success" as const,
  },
];

const journey = [
  ["01", "Se abre el caso", "El síntoma original queda registrado."],
  ["02", "El taller demuestra", "Inspección, medidas y evidencia."],
  ["03", "La cotización se congela", "El precio que viste ya no cambia silenciosamente."],
  ["04", "Tú decides", "Autoriza todo, una parte o rechaza."],
] as const;

export default function HomePage() {
  return (
    <div className="flex flex-col gap-20 md:gap-28">
      <section className="grid items-center gap-12 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <Kicker className="text-[var(--color-brand-400)]">
            Infraestructura de confianza automotriz
          </Kicker>
          <Display as="h1" className="mt-4 max-w-3xl">
            Tu taller opera. Tu cliente entiende. Cada decisión queda respaldada.
          </Display>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-muted-400)] md:text-lg">
            Datatek une la operación del taller con la experiencia del conductor. Desde el primer
            mensaje hasta la autorización, ambos ven la misma verdad — explicada para cada uno.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="/pro" variant="primary" size="lg">
              Conocer Datatek Pro <ArrowRight className="h-4 w-4" aria-hidden />
            </LinkButton>
            <LinkButton href="/pass" size="lg">
              Ver Datatek Pass
            </LinkButton>
          </div>
          <ul className="mt-8 grid gap-3 text-sm text-[var(--color-muted-400)] sm:grid-cols-3">
            {promises.map((promise) => (
              <li key={promise} className="flex items-start gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success-400)]"
                  aria-hidden
                />
                <span>{promise}</span>
              </li>
            ))}
          </ul>
        </div>

        <Card className="relative p-5 md:p-6" accent="brand">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.12em] text-[var(--color-muted-400)] uppercase">
                Caso DTEK-2026-0142
              </p>
              <p className="mt-2 text-xl font-semibold">Toyota Corolla 2018</p>
              <p className="text-sm text-[var(--color-muted-400)]">Frenos delanteros · P-123ABC</p>
            </div>
            <Badge tone="warning">Esperando autorización</Badge>
          </div>

          <div className="mt-6 rounded-[var(--radius-control)] bg-[var(--surface-well)] p-4 shadow-[var(--neu-inset)]">
            <p className="text-xs font-semibold tracking-[0.12em] text-[var(--color-muted-400)] uppercase">
              Lo importante ahora
            </p>
            <p className="mt-2 font-medium">Desgaste crítico en pastillas delanteras</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted-400)]">
              La inspección registró 2.1 mm. El taller recomienda reemplazarlas antes de continuar
              usando el vehículo con normalidad.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2" aria-label="Progreso del caso">
            {["Recibido", "Revisado", "Cotizado", "Decisión"].map((step, index) => (
              <div key={step} className="min-w-0">
                <span
                  className={`block h-1.5 rounded-full ${
                    index < 3 ? "bg-[var(--color-brand-500)]" : "bg-white/10"
                  }`}
                />
                <span className="mt-2 block truncate text-[10px] text-[var(--color-muted-400)]">
                  {step}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/8 pt-5">
            <div>
              <p className="text-xs text-[var(--color-muted-400)]">Cotización congelada</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">Q 1,600.00</p>
            </div>
            <span className="rounded-[var(--radius-control)] bg-[var(--color-brand-500)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--neu-raised-sm)]">
              Revisar y decidir
            </span>
          </div>
        </Card>
      </section>

      <section aria-labelledby="productos-datatek">
        <div className="max-w-2xl">
          <Kicker>Un ecosistema, tres experiencias</Kicker>
          <h2
            id="productos-datatek"
            className="mt-3 text-[clamp(32px,5vw,52px)] leading-[0.96] font-[300] tracking-[-0.055em]"
          >
            La misma información, presentada para quien la necesita.
          </h2>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {products.map((product) => {
            const Icon = product.icon;
            return (
              <Card key={product.name} className="flex min-h-72 flex-col">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-panel)] text-[var(--color-brand-400)] shadow-[var(--neu-raised-sm)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <Badge tone={product.accent} className="mt-6 self-start">
                  {product.audience}
                </Badge>
                <SectionTitle className="mt-4 text-2xl">{product.name}</SectionTitle>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--color-muted-400)]">
                  {product.description}
                </p>
                <a
                  href={product.href}
                  className="focus-ring mt-6 inline-flex items-center gap-2 self-start rounded-[var(--radius-control)] text-sm font-semibold text-[var(--color-paper-50)]"
                >
                  Explorar <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </Card>
            );
          })}
        </div>
      </section>

      <section
        className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start"
        aria-labelledby="caso-verificable"
      >
        <div>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-panel)] text-[var(--color-success-400)] shadow-[var(--neu-raised-sm)]">
            <FileCheck2 className="h-6 w-6" aria-hidden />
          </div>
          <Kicker className="mt-6">Caso verificable</Kicker>
          <h2
            id="caso-verificable"
            className="mt-3 text-[clamp(30px,4.5vw,48px)] leading-[0.98] font-[300] tracking-[-0.05em]"
          >
            La cita organiza el tiempo. El caso conserva la verdad.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-[var(--color-muted-400)] md:text-base">
            Cada hallazgo, cotización y decisión permanece ligado al mismo vehículo y al mismo
            expediente. Nada importante queda perdido en un chat aislado.
          </p>
        </div>

        <Card className="grid gap-2 p-3 sm:grid-cols-2">
          {journey.map(([number, title, body]) => (
            <div
              key={number}
              className="rounded-[var(--radius-control)] p-5 transition-colors hover:bg-white/[0.025]"
            >
              <span className="text-xs font-bold tracking-[0.14em] text-[var(--color-brand-400)]">
                {number}
              </span>
              <p className="mt-3 font-semibold">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-400)]">{body}</p>
            </div>
          ))}
        </Card>
      </section>

      <section className="rounded-[var(--radius-hero)] bg-[var(--color-navy-900)] p-7 shadow-[var(--neu-raised-lg)] md:p-10">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-accent-blue-400)]">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              <span className="text-xs font-semibold tracking-[0.12em] uppercase">
                Confianza por diseño
              </span>
            </div>
            <h2 className="mt-4 max-w-2xl text-3xl leading-tight font-[400] tracking-[-0.04em] md:text-4xl">
              Un taller no debería pedirte fe. Debería poder mostrarte qué encontró y qué
              autorizaste.
            </h2>
          </div>
          <LinkButton href="/trust" variant="primary" size="lg">
            Cómo construimos confianza
          </LinkButton>
        </div>
      </section>
    </div>
  );
}
