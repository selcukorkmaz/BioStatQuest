// POST /api/ai/explain
//
// F15 (Phase 0) — single-turn AI explainer scoped to ONE post-reveal
// question. The endpoint is deliberately narrow: it does not run a
// multi-turn chat, does not solve unrelated problems, and does not
// reach outside the bounded context the client provides. The system
// prompt is the security boundary.
//
// Body:
//   {
//     qid:          string,
//     caseId:       string,
//     stem:         string,           // the question prompt as shown to the learner
//     options?:     string[],         // mcq/multi only
//     correctIndex?: number | number[], // index of correct answer (or correct set)
//     pickedIndex?: number | number[] | string | null,
//     baseExplain:  string,           // the canonical `explain` text
//     methodTitle?: string,           // optional method title from DeepDive
//     userMessage:  string            // the learner's actual question (≤ 500 chars)
//   }
//
// Response:
//   { reply: string, model: string, tokens_in?: number, tokens_out?: number }
//
// Errors: 401 (auth), 400 (validation), 429 (quota), 500 (gateway).
//
// Env: AI_GATEWAY_API_KEY (Vercel AI Gateway), optional AI_GATEWAY_MODEL
// (default "anthropic/claude-haiku-4-5"), AI_FREE_WEEKLY_QUOTA (default 5).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";
// The system-prompt construction lives in src/lib so it can be unit-tested
// alongside the rest of the app (vitest is scoped to src/).
import { buildSystemPrompt } from "../../src/lib/aiPrompt";

const AI_GATEWAY_URL   = "https://gateway.ai.vercel.com/v1/chat/completions";
const DEFAULT_MODEL    = "anthropic/claude-haiku-4-5";
const FREE_WEEKLY_DEFAULT = 5;
const MAX_USER_MESSAGE_CHARS = 500;
const MAX_OUTPUT_TOKENS = 500;

async function readBody(req: VercelRequest): Promise<any> {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---- 1. Auth ----------
  const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!authHeader) return res.status(401).json({ error: "Missing auth token" });

  const admin = supabaseAdmin();
  const { data: userData, error: userErr } = await admin.auth.getUser(authHeader);
  if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
  const user = userData.user;

  // ---- 2. Validate body ----------
  const body = await readBody(req);
  const userMessage = String(body.userMessage || "").trim().slice(0, MAX_USER_MESSAGE_CHARS);
  if (!userMessage) return res.status(400).json({ error: "Missing userMessage" });
  const qid = String(body.qid || "");
  const caseId = String(body.caseId || "");
  const stem = String(body.stem || "");
  if (!qid || !caseId || !stem) return res.status(400).json({ error: "Missing question context" });

  const options = Array.isArray(body.options) ? body.options.map((s: any) => String(s)).slice(0, 12) : undefined;
  const correctIndex = body.correctIndex;
  const baseExplain = String(body.baseExplain || "");
  const methodTitle = body.methodTitle ? String(body.methodTitle).slice(0, 200) : undefined;

  // ---- 3. Quota: free tier is N/week; Pro is unlimited ----------
  const { data: progress } = await admin
    .from("user_progress")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const isPro = progress?.user_type === "pro" || progress?.user_type === "institutional";

  if (!isPro) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countErr } = await admin
      .from("ai_chats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "ok")
      .gte("created_at", since);
    if (!countErr) {
      const limit = Number(process.env.AI_FREE_WEEKLY_QUOTA) || FREE_WEEKLY_DEFAULT;
      if ((count ?? 0) >= limit) {
        return res.status(429).json({
          error: "Weekly AI tutor quota reached",
          quota: limit,
          remaining: 0,
          upgrade: true,
        });
      }
    }
  }

  // ---- 4. Build prompt + call AI Gateway ----------
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "AI_GATEWAY_API_KEY not configured" });
  const model = process.env.AI_GATEWAY_MODEL || DEFAULT_MODEL;
  const system = buildSystemPrompt({ stem, options, correctIndex, baseExplain, methodTitle });

  let aiReply = "";
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  try {
    const resp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: userMessage },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      // Log the failed attempt then surface the gateway error.
      await admin.from("ai_chats").insert({
        user_id: user.id, qid, case_id: caseId,
        user_message: userMessage, ai_reply: null, model,
        status: "error", error: `gateway ${resp.status}: ${text.slice(0, 500)}`,
      });
      return res.status(502).json({ error: `AI gateway error (${resp.status})` });
    }
    const json = await resp.json() as any;
    aiReply = String(json?.choices?.[0]?.message?.content ?? "").trim();
    tokensIn  = json?.usage?.prompt_tokens     ?? undefined;
    tokensOut = json?.usage?.completion_tokens ?? undefined;
  } catch (e: any) {
    await admin.from("ai_chats").insert({
      user_id: user.id, qid, case_id: caseId,
      user_message: userMessage, ai_reply: null, model,
      status: "error", error: (e?.message || String(e)).slice(0, 500),
    });
    return res.status(502).json({ error: "AI gateway unreachable" });
  }

  // ---- 5. Log the successful turn ----------
  await admin.from("ai_chats").insert({
    user_id: user.id,
    qid,
    case_id: caseId,
    user_message: userMessage,
    ai_reply: aiReply,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    status: "ok",
  });

  return res.status(200).json({ reply: aiReply, model, tokens_in: tokensIn, tokens_out: tokensOut });
}
