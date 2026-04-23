import OpenAI from "npm:openai";
import { createServiceClient } from "./supabase.ts";

export function getOpenAIClient() {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey });
}

export function getModel() {
  return Deno.env.get("OPENAI_MODEL") || "gpt-5.4-mini";
}

export async function logAiUsage(profileId: string | null, featureKey: string, status: string, metadata: Record<string, unknown> = {}, errorMessage?: string) {
  const supabase = createServiceClient();
  await supabase.from("ai_request_logs").insert({
    profile_id: profileId,
    feature_key: featureKey,
    status,
    model: getModel(),
    error_message: errorMessage || null,
    metadata,
  });
}

export async function createJsonResponse(systemPrompt: string, userPayload: unknown) {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: getModel(),
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(userPayload) }] },
    ],
    text: { format: { type: "json_object" } },
  });

  const text = response.output_text || "{}";
  return JSON.parse(text);
}

