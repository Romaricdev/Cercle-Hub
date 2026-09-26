import { ShopDetailPage } from "../../../../components/business/p03-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ShopDetailPage id={(await params).id} />;
}
