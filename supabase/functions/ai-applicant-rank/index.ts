import { corsHeaders, error, json } from "../_shared/http.ts";
import { createJsonResponse, logAiUsage } from "../_shared/ai.ts";
import { createServiceClient, getUserFromRequest } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error("Method not allowed", 405);
  const user = await getUserFromRequest(req);
  if (!user) return error("Unauthorized", 401);
  const body = await req.json().catch(() => ({}));
  const supabase = createServiceClient();
  try {
    const { data: applications } = await supabase
      .from("applications")
      .select("id, student_id, note, answers, availability, status")
      .eq("job_id", body.jobId);
    const { data: job } = await supabase.from("jobs").select("*").eq("id", body.jobId).maybeSingle();
    const { data: students } = await supabase.from("students").select("*").in("id", (applications || []).map((item) => item.student_id));

    const ranked = await createJsonResponse(
      "You rank applicants for a job. Return JSON with rankings array containing applicationId, studentId, match_score, rank_position, summary_reason, strengths, and concerns.",
      { job, applications, students },
    );

    const rankings = Array.isArray(ranked.rankings) ? ranked.rankings : [];
    for (const entry of rankings) {
      await supabase.from("ai_applicant_rankings").upsert({
        employer_id: user.id,
        job_id: body.jobId,
        application_id: entry.applicationId,
        student_id: entry.studentId || null,
        match_score: entry.match_score || 0,
        rank_position: entry.rank_position || null,
        summary_reason: entry.summary_reason || "",
        strengths: entry.strengths || [],
        concerns: entry.concerns || [],
      }, { onConflict: "job_id,application_id" });
    }
    await logAiUsage(user.id, "applicant_ranking", "success", { jobId: body.jobId, count: rankings.length });
    return json({ rankings });
  } catch (err) {
    await logAiUsage(user.id, "applicant_ranking", "error", { jobId: body.jobId }, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

