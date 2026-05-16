// Lemon Squeezy helpers — env-backed config + minimal REST client.
// LS doesn't ship a first-party Node SDK we want to depend on; the v1
// REST API is straightforward to call directly. Anything we need from
// it lives here so endpoints stay slim.

const LS_API = "https://api.lemonsqueezy.com/v1";

export const LS_API_KEY        = () => process.env.LEMONSQUEEZY_API_KEY        || "";
export const LS_STORE_ID       = () => process.env.LEMONSQUEEZY_STORE_ID       || "";
export const LS_WEBHOOK_SECRET = () => process.env.LEMONSQUEEZY_WEBHOOK_SECRET || "";
export const LS_VARIANT_MONTHLY = () => process.env.LEMONSQUEEZY_VARIANT_PRO_MONTHLY || "";
export const LS_VARIANT_YEARLY  = () => process.env.LEMONSQUEEZY_VARIANT_PRO_YEARLY  || "";

// Test-mode toggle. The LS dashboard's Test/Live switch controls UI
// only; checkouts created via the API must carry `test_mode: true`
// explicitly. Set LEMONSQUEEZY_TEST_MODE=true in Vercel while running
// pre-live smoke tests, and unset (or set to false) when going live.
//
// Returns true when the env value is the literal string "true" — be
// strict here so an accidental "True" or "1" doesn't silently leave us
// charging real cards.
export const LS_TEST_MODE = () => process.env.LEMONSQUEEZY_TEST_MODE === "true";

type LsCreateCheckoutOpts = {
  variantId: string;
  storeId: string;
  userId: string;        // supabase user id; round-tripped via custom_data
  email?: string;
  successUrl?: string;
};

// Create a hosted checkout link. Docs:
// https://docs.lemonsqueezy.com/api/checkouts/create-checkout
export async function lsCreateCheckout(opts: LsCreateCheckoutOpts): Promise<string> {
  const key = LS_API_KEY();
  if (!key) throw new Error("LEMONSQUEEZY_API_KEY not set");
  const body = {
    data: {
      type: "checkouts",
      attributes: {
        // test_mode is REQUIRED here even when the LS dashboard toggle
        // is on test mode — the dashboard switch only affects the UI;
        // API-created checkouts default to live unless we pass this.
        // See: https://docs.lemonsqueezy.com/api/checkouts/create-checkout
        test_mode: LS_TEST_MODE(),
        // The custom_data round-trips into the webhook events so we can
        // reliably attach the subscription back to a Supabase user.
        checkout_data: {
          custom: { supabase_user_id: opts.userId },
          email: opts.email,
        },
        product_options: {
          redirect_url: opts.successUrl,
        },
      },
      relationships: {
        store:   { data: { type: "stores",   id: opts.storeId } },
        variant: { data: { type: "variants", id: opts.variantId } },
      },
    },
  };
  const r = await fetch(`${LS_API}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`LS checkout create failed: ${r.status} ${txt}`);
  }
  const json = await r.json() as any;
  const url = json?.data?.attributes?.url;
  if (!url) throw new Error("LS checkout response missing url");
  return url as string;
}

// Look up a customer to mint a portal URL. The customer JSON contains
// `urls.customer_portal` which we redirect to.
export async function lsCustomerPortalUrl(customerId: string): Promise<string> {
  const key = LS_API_KEY();
  if (!key) throw new Error("LEMONSQUEEZY_API_KEY not set");
  const r = await fetch(`${LS_API}/customers/${customerId}`, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${key}`,
    },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`LS customer fetch failed: ${r.status} ${txt}`);
  }
  const json = await r.json() as any;
  const url = json?.data?.attributes?.urls?.customer_portal;
  if (!url) throw new Error("LS customer has no customer_portal url");
  return url as string;
}
