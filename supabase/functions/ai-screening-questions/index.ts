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
    const result = await createJsonResponse(
      "You suggest five strong screening questions for a job. Return JSON with questions array.",
      body,
    );
    await logAiUsage(user.id, "screening_questions", "success", {});
    return json({ questions: result.questions || [] });
  } catch (err) {
    await logAiUsage(user.id, "screening_questions", "error", {}, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

