import { PassShellLayout } from "../../components/pass-shell-layout";

export default function PassLayout({ children }: { children: React.ReactNode }) {
  return <PassShellLayout>{children}</PassShellLayout>;
}
