import { getAdminPageInfo, adminLinks } from "@/lib/admin-nav";

export async function AdminPageHeaderServer({
  pathname,
}: {
  pathname: string;
}) {
  const pageInfo = getAdminPageInfo(pathname);

  if (!pageInfo) return null;

  const Icon = pageInfo.icon;

  return (
    <div className="flex items-center gap-3 mb-6">
      <Icon className="h-8 w-8 text-gray-700" />
      <h1 className="text-3xl font-bold text-gray-900">{pageInfo.label}</h1>
    </div>
  );
}
