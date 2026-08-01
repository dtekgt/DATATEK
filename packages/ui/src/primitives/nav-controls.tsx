"use client";

import { useState, type ReactNode } from "react";
import { cn } from "../utils/cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultTabId?: string;
  ariaLabel: string;
}

/** Accessible tabs with roving keyboard focus (ArrowLeft/ArrowRight/Home/End). */
export function Tabs({ items, defaultTabId, ariaLabel }: TabsProps) {
  const [active, setActive] = useState(defaultTabId ?? items[0]?.id);

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    let nextIndex = index;
    if (e.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    if (e.key === "Home") nextIndex = 0;
    if (e.key === "End") nextIndex = items.length - 1;
    const next = items[nextIndex];
    if (next) {
      setActive(next.id);
      document.getElementById(`tab-${next.id}`)?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-white/10">
        {items.map((item, index) => {
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              id={`tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                "focus-ring tap-target rounded-t-[var(--radius-control)] px-4 text-sm font-medium",
                selected
                  ? "border-b-2 border-[var(--color-brand-400)] text-[var(--color-paper-50)]"
                  : "text-[var(--color-muted-400)] hover:text-[var(--color-paper-50)]",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${item.id}`}
          hidden={active !== item.id}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export function SegmentedControl({ options, value, onChange, ariaLabel }: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-[var(--radius-control)] border border-white/10 bg-[var(--color-surface-800)] p-1"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "focus-ring tap-target rounded-[10px] px-3 text-sm font-medium transition-colors",
              selected ? "bg-[var(--color-brand-500)] text-white" : "text-[var(--color-muted-400)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
}

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);
  return (
    <div className="divide-y divide-white/8 rounded-[var(--radius-control)] border border-white/8">
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <div key={item.id}>
            <h3>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`accordion-panel-${item.id}`}
                onClick={() => setOpenId(open ? null : item.id)}
                className="focus-ring tap-target flex w-full items-center justify-between px-4 text-left text-sm font-medium"
              >
                {item.title}
                <span aria-hidden>{open ? "−" : "+"}</span>
              </button>
            </h3>
            <div id={`accordion-panel-${item.id}`} hidden={!open} className="px-4 pb-4 text-sm">
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
