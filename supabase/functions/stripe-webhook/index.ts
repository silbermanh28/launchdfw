import Stripe from "npm:stripe";
import { corsHeaders, error, json } from "../_shared/http.ts";
import { createServiceClient, mirrorSubscriptionToProfile } from "../_shared/supabase.ts";

function normalizePremiumStatus(status: string | null | undefined) {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "canceled";
  return "expired";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2024-06-20" });
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) return error("Missing STRIPE_WEBHOOK_SECRET", 500);

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return error("Missing Stripe signature", 400);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    return error(`Webhook signature verification failed: ${(err as Error).message}`, 400);
  }

  const supabase = createServiceClient();
  const subscription =
    event.type.startsWith("customer.subscription")
      ? (event.data.object as Stripe.Subscription)
      : event.type === "checkout.session.completed"
        ? null
        : null;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const profileId = String(session.metadata?.profile_id || "");
    const role = String(session.metadata?.role || session.subscription_details?.metadata?.role || "student");
    if (profileId) {
      await mirrorSubscriptionToProfile(supabase, profileId, {
        stripe_customer_id: session.customer as string,
        subscription_role: role,
      });
    }
  }

  if (subscription) {
    const profileId = String(subscription.metadata?.profile_id || "");
    const role = String(subscription.metadata?.role || "student");
    const planKey = String(subscription.metadata?.premium_plan_key || (role === "employer" ? "employer_premium_monthly" : "student_premium_monthly"));
    const premiumStatus = normalizePremiumStatus(subscription.status);
    const periodEnd = subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
      : null;
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;

    if (profileId) {
      await supabase.from("subscriptions").upsert({
        profile_id: profileId,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        stripe_price_id: subscription.items.data[0]?.price?.id || null,
        subscription_role: role,
        premium_plan_key: planKey,
        premium_status: premiumStatus,
        current_period_starts_at: subscription.items.data[0]?.current_period_start ? new Date(subscription.items.data[0].current_period_start * 1000).toISOString() : null,
        current_period_ends_at: periodEnd,
        premium_expires_at: periodEnd,
        trial_starts_at: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null,
        trial_ends_at: trialEnd,
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
        metadata: subscription.metadata || {},
      }, { onConflict: "stripe_subscription_id" });

      await mirrorSubscriptionToProfile(supabase, profileId, {
        subscription_role: role,
        premium_status: premiumStatus,
        premium_plan_key: planKey,
        premium_expires_at: periodEnd,
        trial_ends_at: trialEnd,
        stripe_customer_id: subscription.customer as string,
        stripe_subscription_id: subscription.id,
        cancel_at_period_end: subscription.cancel_at_period_end,
      });
    }
  }

  return json({ received: true });
});

