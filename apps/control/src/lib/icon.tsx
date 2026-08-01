import type { ComponentType } from "react";
import * as icons from "lucide-react";
import { HelpCircle } from "lucide-react";

type IconName = keyof typeof icons;
type LucideComponent = ComponentType<{ className?: string }>;

export function RouteIcon({ name, className }: { name: string; className?: string }) {
  const Component = (icons as unknown as Record<IconName, LucideComponent>)[name as IconName];
  const Resolved = Component ?? HelpCircle;
  return <Resolved className={className} aria-hidden />;
}
