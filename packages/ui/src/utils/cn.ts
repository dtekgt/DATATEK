import { clsx, type ClassValue } from "clsx";

/** Controlled className merge. No tailwind-merge dependency: class lists in
 * this package are curated, so plain clsx concatenation is deterministic. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
