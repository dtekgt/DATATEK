import type { HTMLAttributes } from "react";
import { cn } from "../utils/cn";

/* Tipografía de marca D-TEK.
 *
 * La regla que gobierna todo esto es contraintuitiva y por eso vale escribirla:
 * los títulos van en peso **300**, no en bold. El design system lo dice
 * explícitamente — "lo opuesto a la tipografía bold de marketing típica". El
 * peso lo aportan el tamaño y el tracking negativo, no el grosor del trazo.
 *
 * Las etiquetas son el inverso exacto: diminutas, semibold, mayúsculas y muy
 * espaciadas. Esa tensión entre display ligero y etiqueta apretada es la firma
 * tipográfica de la marca; usar una sin la otra la deshace.
 */

type Level = "h1" | "h2" | "h3" | "p";

export interface TitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** El nivel semántico se elige por la estructura de la página, no por el
   * tamaño que se quiere ver. Una página tiene un solo `h1`. */
  as?: Level;
}

/** Escala de display: para héroes de marketing. Enorme, ligerísima, con
 * interlineado por debajo de 1 para que dos líneas se lean como un bloque. */
export function Display({ as: Tag = "h1", className, ...props }: TitleProps) {
  return (
    <Tag
      className={cn(
        "text-[clamp(38px,5vw,66px)] leading-[0.88] font-[300] tracking-[-0.065em] text-balance",
        className,
      )}
      {...props}
    />
  );
}

/** Título de página dentro del producto. Deliberadamente NO usa la escala de
 * display: 108px tienen sentido en un hero de marketing y son ridículos sobre
 * una lista de casos. */
export function PageTitle({ as: Tag = "h1", className, ...props }: TitleProps) {
  return (
    <Tag
      className={cn(
        "text-[clamp(22px,3vw,30px)] leading-[0.95] font-[300] tracking-[-0.055em]",
        className,
      )}
      {...props}
    />
  );
}

/** Título de sección dentro de una página. */
export function SectionTitle({ as: Tag = "h2", className, ...props }: TitleProps) {
  return (
    <Tag
      className={cn("text-[18px] leading-tight font-[400] tracking-[-0.03em]", className)}
      {...props}
    />
  );
}

/** La micro-etiqueta en mayúsculas que abre un bloque. El design system la
 * pone antes de casi todo título; es lo que da el aire de lectura de tablero
 * en lugar de página de texto. */
export function Kicker({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "text-[11px] font-[550] tracking-[0.12em] text-[var(--color-muted-400)] uppercase",
        className,
      )}
      {...props}
    />
  );
}
