import { ProShellLayout } from "../../../../../components/pro-shell-layout";

export default async function ProOrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <ProShellLayout orgSlug={orgSlug}>{children}</ProShellLayout>;
}
