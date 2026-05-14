import { getAnalyticsAction } from "@/actions/analytics";
import { AdminPageHeader } from "@/components/admin-page-header";
import { AnalyticsClient } from "./analytics-client";

export default async function AdminAnalyticsPage() {
  const data = await getAnalyticsAction();
  return (
    <div>
      <AdminPageHeader />
      <AnalyticsClient data={data} />
    </div>
  );
}
