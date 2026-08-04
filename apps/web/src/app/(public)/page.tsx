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
    audience: "TRABAJO EN UN TALLER",
    description:
      "El espacio privado donde el equipo abre casos, registra hallazgos, cotiza y solicita decisiones.",
    boundary: "Puede operar el trabajo. No es la cuenta del conductor.",
    href: "/pro",
    icon: Wrench,
    accent: "brand" as const,
  },
  {
    name: "Datatek Pass",
    audience: "QUIERO VER MI VEHÍCULO",
    description:
      "El espacio personal donde el conductor entiende hallazgos, revisa lo que debe decidir y conserva su historial.",
    boundary: "Puede revisar y decidir. No puede operar el taller.",
    href: "/pass",
    icon: CarFront,
    accent: "info" as const,
  },
  {
    name: "Datatek Market",
    audience: "Para conectar",
    description:
      "Descubre talleres y servicios con precios que siempre explican si son fijos, desde, por rango o sujetos a diagnóstico.",
    boundary: "Conecta a las partes. No mezcla sus accesos privados.",
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
          <Kicker className="text-[var(--color-brand-400)]">Dos accesos · una misma verdad</Kicker>
          <Display as="h1" className="mt-4 max-w-3xl">
            El taller trabaja en Pro. El conductor revisa su vehículo en Pass.
          </Display>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--color-muted-400)] md:text-lg">
            Son espacios separados. Pro contiene las herramientas y datos internos del taller; Pass
            recibe únicamente la información que corresponde al cliente. Una persona puede tener
            ambos permisos sin que los datos se mezclen.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton href="#elige-tu-espacio" variant="primary" size="lg">
              Elegir mi acceso <ArrowRight className="h-4 w-4" aria-hidden />
            </LinkButton>
            <LinkButton href="/trust" size="lg">
              Cómo se separan los datos
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

        <Card className="relative flex flex-col gap-3 p-4 md:p-5" accent="brand">
          <div className="rounded-[var(--radius-control)] bg-[var(--surface-well)] p-5 shadow-[var(--neu-inset)]">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)]">
                <Wrench className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <Badge tone="brand">DATATEK PRO</Badge>
                <p className="mt-2 font-semibold">Acceso del taller</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted-400)]">
              Abrir caso → inspeccionar → cotizar → solicitar autorización.
            </p>
            <p className="mt-2 text-xs text-[var(--color-muted-400)]">
              Incluye notas y controles internos que el cliente nunca recibe.
            </p>
          </div>

          <div className="flex items-center gap-3 px-3 py-1 text-xs text-[var(--color-muted-400)]">
            <span className="h-px flex-1 bg-white/10" />
            SOLO CRUZA INFORMACIÓN APROBADA PARA EL CLIENTE
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <div className="rounded-[var(--radius-control)] border border-[var(--color-info-400)]/20 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-info-400)]/15 text-[var(--color-info-400)]">
                <CarFront className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <Badge tone="info">DATATEK PASS</Badge>
                <p className="mt-2 font-semibold">Acceso del conductor</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[var(--color-muted-400)]">
              Entender el hallazgo → revisar el total → decidir → conservar historial.
            </p>
            <p className="mt-2 text-xs text-[var(--color-muted-400)]">
              No permite cambiar inspecciones, precios ni operación del taller.
            </p>
          </div>
        </Card>
      </section>

      <section id="elige-tu-espacio" aria-labelledby="productos-datatek" className="scroll-mt-24">
        <div className="max-w-2xl">
          <Kicker>¿Qué vienes a hacer?</Kicker>
          <h2
            id="productos-datatek"
            className="mt-3 text-[clamp(32px,5vw,52px)] leading-[0.96] font-[300] tracking-[-0.055em]"
          >
            Entra por la puerta que corresponde a tu papel.
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
                <p className="mt-4 border-t border-white/8 pt-4 text-xs leading-relaxed text-[var(--color-muted-400)]">
                  {product.boundary}
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
