"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../primitives/buttons";
import { cn } from "../utils/cn";

export interface GuidedFlowStep {
  id: string;
  title: string;
  content: ReactNode;
  /** Optional per-step validation before advancing. */
  canAdvance?: boolean;
}

export interface GuidedFlowProps {
  steps: GuidedFlowStep[];
  onComplete?: () => void;
  completeLabel?: string;
}

/** Ley 48: una tarea compleja se divide en pasos pequeños con progreso y
 * revisión antes de confirmar. Ley: retroceder conserva datos conocidos —
 * step state lives in the parent (via `content`), this component only tracks
 * the current index, never unmounts previous step data. */
export function GuidedFlow({ steps, onComplete, completeLabel = "Confirmar" }: GuidedFlowProps) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  if (!step) return null;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-center gap-2" aria-label="Progreso del flujo">
        {steps.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                i === index
                  ? "bg-[var(--color-brand-500)] text-white"
                  : i < index
                    ? "bg-[var(--color-success-400)]/20 text-[var(--color-success-400)]"
                    : "bg-white/10 text-[var(--color-muted-400)]",
              )}
            >
              {i + 1}
            </span>
            {i < steps.length - 1 ? <span aria-hidden className="h-px w-6 bg-white/15" /> : null}
          </li>
        ))}
      </ol>
      <h2 className="text-base font-semibold">{step.title}</h2>
      <div>{step.content}</div>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="secondary"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          Atrás
        </Button>
        {isLast ? (
          <Button type="button" onClick={onComplete}>
            {completeLabel}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={step.canAdvance === false}
            onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))}
          >
            Siguiente
          </Button>
        )}
      </div>
    </div>
  );
}
