import { Suspense } from "react";

import { ManagerPurchaseNewPage } from "../../../../components/business/p06-manager-pages";
import { Skeleton } from "../../../../components/ui/skeleton";

export default function Page() {
  return <Suspense fallback={<Skeleton className="h-80" />}><ManagerPurchaseNewPage /></Suspense>;
}
