import { corsHeaders, error, json } from "../_shared/http.ts";
import { createJsonResponse, logAiUsage } from "../_shared/ai.ts";
import { createServiceClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);
  const user = await getUserFromRequest(req);
  if (!user) return error("Unauthorized", 401);

  const body = await req.json().catch(() => ({}));
  try {
    const review = await createJsonResponse(
      "You are an expert resume reviewer for high school and college students. Return JSON with score, summary, missing_sections, rewritten_bullets, and improvement_actions. For score_only mode, still return score and short summary.",
      body,
    );
    const supabase = createServiceClient();
    await supabase.from("ai_resume_reviews").insert({
      student_id: user.id,
      score: review.score || null,
      summary: review.summary || "",
      missing_sections: review.missing_sections || [],
      rewritten_bullets: review.rewritten_bullets || [],
      improvement_actions: review.improvement_actions || [],
      review_mode: body.mode || "full",
      source_resume_snapshot: body.resumeData || {},
    });
    await logAiUsage(user.id, "resume_review", "success", { mode: body.mode || "full" });
    return json({ review });
  } catch (err) {
    await logAiUsage(user.id, "resume_review", "error", {}, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

