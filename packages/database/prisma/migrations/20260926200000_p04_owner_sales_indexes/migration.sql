CREATE INDEX sales_org_business_posted_idx ON sales (organization_id, business_date DESC, posted_at DESC, id DESC);
CREATE INDEX sales_org_shop_business_idx ON sales (organization_id, shop_id, business_date DESC);
CREATE INDEX sales_org_actor_business_idx ON sales (organization_id, actor_id, business_date DESC);
CREATE INDEX sale_payments_account_idx ON sale_payments (account_id);
