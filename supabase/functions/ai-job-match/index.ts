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
    const result = await createJsonResponse(
      "You score how well a student matches a list of jobs. Return JSON with a matches array of objects containing jobId, match_score, summary, strengths, and gaps. Keep scores realistic and concise.",
      body,
    );
    const matches = Array.isArray(result.matches) ? result.matches : [];
    const supabase = createServiceClient();
    for (const match of matches) {
      await supabase.from("ai_job_match_scores").upsert({
        student_id: user.id,
        job_id: match.jobId,
        match_score: match.match_score || 0,
        summary: match.summary || "",
        strengths: match.strengths || [],
        gaps: match.gaps || [],
      }, { onConflict: "student_id,job_id" });
    }
    await logAiUsage(user.id, "job_match_score", "success", { count: matches.length });
    return json({ matches });
  } catch (err) {
    await logAiUsage(user.id, "job_match_score", "error", {}, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

