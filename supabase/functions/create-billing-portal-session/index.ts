import Stripe from "npm:stripe";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { createServiceClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);

  const user = await getUserFromRequest(req);
  if (!user) return error("Unauthorized", 401);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2024-06-20" });
  const supabase = createServiceClient();
  const { data: profile } = await supabase.from("profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (!profile?.stripe_customer_id) return error("No Stripe customer found for this account", 400);

  const returnUrl = Deno.env.get("STRIPE_BILLING_RETURN_URL") || Deno.env.get("SITE_URL") || "http://localhost:5173";
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: returnUrl,
  });
  return json({ url: session.url });
});

