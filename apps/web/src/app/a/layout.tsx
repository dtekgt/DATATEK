import { LimitedAuthorizationShell } from "../../components/limited-authorization-shell";

export default function LimitedAuthLayout({ children }: { children: React.ReactNode }) {
  return <LimitedAuthorizationShell>{children}</LimitedAuthorizationShell>;
}
