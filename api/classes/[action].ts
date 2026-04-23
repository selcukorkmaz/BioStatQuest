// /api/classes/:action — single dispatcher for every classes endpoint.
//
// WHY: Vercel Hobby caps deployments at 12 serverless functions. Keeping
// each classes endpoint in its own file pushed us over the limit (9
// classes + 1 cron + 3 stripe = 13). Consolidating all nine into this one
// dynamic-route file brings us back to 5 functions with plenty of headroom.
//
// The actual handler logic still lives in api/_classes/*.ts — files and
// directories prefixed with "_" are ignored by Vercel's file-based router
// but can be imported normally. Every handler is unchanged from its
// pre-consolidation form, so the URLs, the request/response shapes, and
// all guards stay identical. This file is pure plumbing.
//
// URL mapping:
//   POST /api/classes/create         → _classes/create.ts
//   POST /api/classes/invite         → _classes/invite.ts
//   POST /api/classes/accept-invite  → _classes/accept-invite.ts
//   POST /api/classes/join-by-code   → _classes/join-by-code.ts
//   GET  /api/classes/mine           → _classes/mine.ts
//   GET  /api/classes/members        → _classes/members.ts
//   POST /api/classes/update-member  → _classes/update-member.ts
//   POST /api/classes/archive        → _classes/archive.ts
//   GET  /api/classes/insights       → _classes/insights.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import createHandler from "../_classes/create.js";
import inviteHandler from "../_classes/invite.js";
import acceptInviteHandler from "../_classes/accept-invite.js";
import joinByCodeHandler from "../_classes/join-by-code.js";
import mineHandler from "../_classes/mine.js";
import membersHandler from "../_classes/members.js";
import updateMemberHandler from "../_classes/update-member.js";
import archiveHandler from "../_classes/archive.js";
import insightsHandler from "../_classes/insights.js";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<unknown> | unknown;

const ROUTES: Record<string, Handler> = {
  create: createHandler as Handler,
  invite: inviteHandler as Handler,
  "accept-invite": acceptInviteHandler as Handler,
  "join-by-code": joinByCodeHandler as Handler,
  mine: mineHandler as Handler,
  members: membersHandler as Handler,
  "update-member": updateMemberHandler as Handler,
  archive: archiveHandler as Handler,
  insights: insightsHandler as Handler,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel populates req.query.action from the [action] path segment.
  // When action isn't set (shouldn't happen given the route shape, but
  // belt-and-braces), 404 rather than crashing with a TypeError.
  const actionRaw = req.query.action;
  const action = typeof actionRaw === "string" ? actionRaw : Array.isArray(actionRaw) ? actionRaw[0] : "";

  const fn = ROUTES[action];
  if (!fn) {
    return res.status(404).json({ error: `unknown classes action: ${action || "(none)"}` });
  }

  try {
    await fn(req, res);
  } catch (e: any) {
    // Individual handlers already handle their own errors; this is only
    // reached if a handler throws synchronously or returns a rejected
    // promise without catching. Log and send a generic 500 so we don't
    // leak stack traces to the client.
    console.error(`[/api/classes/${action}] uncaught:`, e?.message || e);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal error" });
    }
  }
}
