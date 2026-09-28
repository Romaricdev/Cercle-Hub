export interface MeResponse {
  protocolVersion: number;
  csrfToken: string;
  actor: { id: string; displayName: string; email: string; role: "OWNER" | "MANAGER" | string; status: string };
  organization: { id: string; name: string | null; initialized: boolean };
  shop: { id: string; name: string; status: string } | null;
  device: { id: string; name: string; status: string } | null;
  mfa: { required: boolean; enabled: boolean };
  next: string;
}

export const paths = {
  login: "/login",
  loginMfa: "/login?step=mfa",
  loginExpired: "/login?reason=session",
  health: "/health",
  ownerHome: "/owner",
  ownerUsers: "/owner/users",
  ownerDevices: "/owner/devices",
  ownerAccount: "/owner/account",
  ownerShops: "/owner/shops",
  ownerProducts: "/owner/products",
  ownerSources: "/owner/sources",
  ownerLocations: "/owner/locations",
  ownerSettings: "/owner/settings",
  ownerStock: "/owner/stock",
  ownerSales: "/owner/sales",
  setup: "/setup",
  managerHome: "/manager",
  managerDevice: "/manager/device",
  managerStock: "/manager/stock",
  managerSale: "/manager/sale",
  managerSalePayment: "/manager/sale/payment",
  managerSales: "/manager/sales",
} as const;

export function homePath(me: MeResponse): string {
  if (me.actor.role === "OWNER") {
    return paths.ownerHome;
  }
  return paths.managerHome;
}
