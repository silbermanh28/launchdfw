import { corsHeaders, error, json } from "../_shared/http.ts";
import { createJsonResponse, logAiUsage } from "../_shared/ai.ts";
import { getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);
  const user = await getUserFromRequest(req);
  if (!user) return error("Unauthorized", 401);
  const body = await req.json().catch(() => ({}));
  try {
    const draft = await createJsonResponse(
      "You write polished student-friendly job posts. Return JSON with title, description, tags, pay, type, and questions (5 screening questions max).",
      body,
    );
    await logAiUsage(user.id, "job_writer", "success", {});
    return json({ draft });
  } catch (err) {
    await logAiUsage(user.id, "job_writer", "error", {}, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

