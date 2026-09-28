"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import { OwnerSaleDetailPage } from "../../../../components/business/p04-owner-pages";
import { Skeleton } from "../../../../components/ui/skeleton";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense fallback={<Skeleton className="h-80" />}>
      <OwnerSaleDetailPage id={id} />
    </Suspense>
  );
}
