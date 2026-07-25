import OpenAI from "openai";
import { z } from "zod";

const providerResponseSchema = z.object({
  decision: z.enum(["follow-up", "new-question", "revisit-claim", "end"]),
  acknowledgement: z.string().max(140),
  question: z.object({ prompt: z.string().min(12).max(500), competency: z.string().min(2).max(80), topic: z.string().min(2).max(80), kind: z.enum(["follow-up", "revisit", "behavioral", "impact", "judgment", "motivation", "resume", "opening"]) }).nullable(),
});
const outputSchema = {
  type: "object", additionalProperties: false, required: ["decision", "acknowledgement", "question"], properties: {
    decision: { type: "string", enum: ["follow-up", "new-question", "revisit-claim", "end"] }, acknowledgement: { type: "string" },
    question: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, required: ["prompt", "competency", "topic", "kind"], properties: { prompt: { type: "string" }, competency: { type: "string" }, topic: { type: "string" }, kind: { type: "string", enum: ["follow-up", "revisit", "behavioral", "impact", "judgment", "motivation", "resume", "opening"] } } }] },
  },
} as const;

export type ProviderRequest = { resume: string; jobDescription: string; interviewType: string; remainingBudget: number; transcript: { question: string; answer: string; competency: string }[]; topicsCovered: string[]; claims: string[] };
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export function isOpenAIConfigured() { return Boolean(process.env.OPENAI_API_KEY); }

export async function getAdaptiveTurn(input: ProviderRequest): Promise<ProviderResponse> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_NOT_CONFIGURED");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 1 });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
    reasoning: { effort: "low" },
    input: [
      { role: "developer", content: "You are a neutral professional interviewer. Return JSON only. Ask one concise question at a time. Do not praise excessively, score the candidate, invent facts, or repeat covered topics. Choose end when budget is exhausted. Follow up only when evidence, ownership, tradeoffs, or a specific example is needed." },
      { role: "user", content: JSON.stringify(input) },
    ],
    text: { format: { type: "json_schema", name: "interview_turn", strict: true, schema: outputSchema } },
  });
  return providerResponseSchema.parse(JSON.parse(response.output_text));
}
