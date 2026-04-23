import Stripe from "npm:stripe";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { getPlanConfig } from "../_shared/plans.ts";
import { createServiceClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);

  const user = await getUserFromRequest(req);
  if (!user) return error("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  const plan = getPlanConfig(body.role);
  if (!plan.priceId) return error("Missing Stripe price id configuration", 500);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2024-06-20" });
  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("email, role, stripe_customer_id").eq("id", user.id).maybeSingle();

  let customerId = profile?.stripe_customer_id || "";
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || profile?.email || undefined,
      metadata: { profile_id: user.id, role: plan.role },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId, subscription_role: plan.role }).eq("id", user.id);
  }

  const siteUrl = Deno.env.get("SITE_URL") || Deno.env.get("STRIPE_BILLING_RETURN_URL") || "http://localhost:5173";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${siteUrl}?billing=success`,
    cancel_url: `${siteUrl}?billing=cancel`,
    subscription_data: {
      trial_period_days: 7,
      metadata: { profile_id: user.id, role: plan.role, premium_plan_key: plan.planKey },
    },
    allow_promotion_codes: true,
    metadata: { profile_id: user.id, role: plan.role, feature_key: body.featureKey || "" },
  });

  return json({ url: session.url });
});

