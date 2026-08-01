import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "../utils/cn";

const fieldWrap = "flex flex-col gap-1.5";
const label = "text-sm font-medium text-[var(--color-paper-50)]";
const help = "text-xs text-[var(--color-muted-400)]";
const errorText = "text-xs text-[var(--color-danger-400)]";
const controlBase =
  "tap-target focus-ring w-full rounded-[var(--radius-input)] border border-white/12 bg-[var(--color-surface-800)] px-3 text-sm text-[var(--color-paper-50)] placeholder:text-[var(--color-muted-400)] disabled:opacity-50";

interface FieldChromeProps {
  id: string;
  labelText: string;
  helpText?: string;
  error?: string;
  required?: boolean;
  children: (describedBy: string | undefined) => ReactNode;
}

function FieldChrome({ id, labelText, helpText, error, required, children }: FieldChromeProps) {
  const helpId = helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={fieldWrap}>
      <label htmlFor={id} className={label}>
        {labelText}
        {required ? (
          <span aria-hidden className="text-[var(--color-brand-400)]">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {children(describedBy)}
      {helpText ? (
        <p id={helpId} className={help}>
          {helpText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={errorText}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helpText?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label: labelText, helpText, error, id, className, required, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldChrome
      id={fieldId}
      labelText={labelText}
      helpText={helpText}
      error={error}
      required={required}
    >
      {(describedBy) => (
        <input
          ref={ref}
          id={fieldId}
          className={cn(
            controlBase,
            "h-11",
            error && "border-[var(--color-danger-400)]",
            className,
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          required={required}
          {...props}
        />
      )}
    </FieldChrome>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  helpText?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label: labelText, helpText, error, id, className, required, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldChrome
      id={fieldId}
      labelText={labelText}
      helpText={helpText}
      error={error}
      required={required}
    >
      {(describedBy) => (
        <textarea
          ref={ref}
          id={fieldId}
          className={cn(
            controlBase,
            "min-h-24 py-2",
            error && "border-[var(--color-danger-400)]",
            className,
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          required={required}
          {...props}
        />
      )}
    </FieldChrome>
  );
});

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  helpText?: string;
  error?: string;
  options: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label: labelText, helpText, error, id, className, options, required, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <FieldChrome
      id={fieldId}
      labelText={labelText}
      helpText={helpText}
      error={error}
      required={required}
    >
      {(describedBy) => (
        <select
          ref={ref}
          id={fieldId}
          className={cn(
            controlBase,
            "h-11",
            error && "border-[var(--color-danger-400)]",
            className,
          )}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          required={required}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </FieldChrome>
  );
});

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label: labelText, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="checkbox"
        id={fieldId}
        className={cn(
          "tap-target focus-ring h-5 w-5 rounded-[4px] border border-white/20 bg-[var(--color-surface-800)]",
          className,
        )}
        {...props}
      />
      <label htmlFor={fieldId} className="text-sm">
        {labelText}
      </label>
    </div>
  );
});

export const Radio = forwardRef<HTMLInputElement, CheckboxProps>(function Radio(
  { label: labelText, id, className, ...props },
  ref,
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="radio"
        id={fieldId}
        className={cn(
          "tap-target focus-ring h-5 w-5 border border-white/20 bg-[var(--color-surface-800)]",
          className,
        )}
        {...props}
      />
      <label htmlFor={fieldId} className="text-sm">
        {labelText}
      </label>
    </div>
  );
});

export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Switch({ label: labelText, checked, onChange, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelText}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "tap-target focus-ring relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-[var(--color-brand-500)]" : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
