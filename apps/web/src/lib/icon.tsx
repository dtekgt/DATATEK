import type { ComponentType } from "react";
import * as icons from "lucide-react";
import { HelpCircle } from "lucide-react";

type IconName = keyof typeof icons;
type LucideComponent = ComponentType<{ className?: string }>;

/** Resolves a Lucide icon name from the route registry to a component. Falls
 * back to a neutral icon rather than crashing if a name is ever mistyped. */
export function RouteIcon({ name, className }: { name: string; className?: string }) {
  const Component = (icons as unknown as Record<IconName, LucideComponent>)[name as IconName];
  const Resolved = Component ?? HelpCircle;
  return <Resolved className={className} aria-hidden />;
}
