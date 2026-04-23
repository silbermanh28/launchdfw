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
    const generated = await createJsonResponse(
      "You are an interview coach. Return JSON with a questions array of 5 tailored interview questions for the student's applied job.",
      body,
    );
    const questions = Array.isArray(generated.questions) ? generated.questions.map((question: string) => ({ question })) : [];
    const supabase = createServiceClient();
    const { data } = await supabase.from("ai_interview_sessions").insert({
      student_id: user.id,
      job_id: body.jobId || null,
      application_id: body.applicationId || null,
      questions,
      status: "active",
    }).select("*").single();
    await logAiUsage(user.id, "interview_coach", "success", { jobId: body.jobId });
    return json({ session: data });
  } catch (err) {
    await logAiUsage(user.id, "interview_coach", "error", {}, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

