import { Suspense } from "react";

import { OwnerDashboardPage } from "../../components/business/p04-owner-pages";
import { Skeleton } from "../../components/ui/skeleton";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-80" />}>
      <OwnerDashboardPage />
    </Suspense>
  );
}
