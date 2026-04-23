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
      "You are an interview coach. Return JSON with score, feedback, improvedAnswer, readinessScore, and summary.",
      body,
    );
    const supabase = createServiceClient();
    await supabase.from("ai_interview_answers").upsert({
      session_id: body.sessionId,
      question_index: body.questionIndex,
      question: body.question || "",
      answer_text: body.answerText || "",
      score: review.score || null,
      feedback: review.feedback || "",
      improved_answer: review.improvedAnswer || "",
    }, { onConflict: "session_id,question_index" });

    await supabase.from("ai_interview_sessions").update({
      readiness_score: review.readinessScore || null,
      summary: review.summary || "",
    }).eq("id", body.sessionId);

    const { data: session } = await supabase.from("ai_interview_sessions").select("*").eq("id", body.sessionId).maybeSingle();
    const { data: answers } = await supabase.from("ai_interview_answers").select("*").eq("session_id", body.sessionId).order("question_index");
    await logAiUsage(user.id, "interview_coach", "success", { sessionId: body.sessionId, questionIndex: body.questionIndex });
    return json({ session, answers });
  } catch (err) {
    await logAiUsage(user.id, "interview_coach", "error", {}, (err as Error).message);
    return error((err as Error).message, 500);
  }
});

