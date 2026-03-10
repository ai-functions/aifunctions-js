/**
 * Persist and load EvaluationSession by function and scope.
 * Sessions are stored under functions/<id>/scopes/<scopeId>/evaluation-sessions/<sessionId>.json.
 */

import type { ContentResolver } from "nx-content";
import { normalizeKeySegment } from "nx-content";
import type { EvaluationSession } from "./scopedRuntime.js";

const PREFIX = "functions/";
const SESSIONS_DIR = "evaluation-sessions";

function sessionKey(functionId: string, scopeId: string, sessionId: string): string {
  const fnSeg = normalizeKeySegment(functionId);
  const scopeSeg = normalizeKeySegment(scopeId);
  return `${PREFIX}${fnSeg}/scopes/${scopeSeg}/${SESSIONS_DIR}/${normalizeKeySegment(sessionId)}.json`;
}

export async function saveEvaluationSession(
  resolver: ContentResolver,
  session: EvaluationSession
): Promise<void> {
  const key = sessionKey(session.functionId, session.scopeId, session.sessionId);
  await resolver.set(key, JSON.stringify(session, null, 2));
}

export async function getEvaluationSession(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string,
  sessionId: string
): Promise<EvaluationSession | null> {
  const key = sessionKey(functionId, scopeId, sessionId);
  try {
    const raw = await resolver.get(key);
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as Partial<EvaluationSession>;
    if (parsed.sessionId && parsed.functionId && parsed.scopeId && Array.isArray(parsed.attempts)) {
      return parsed as EvaluationSession;
    }
  } catch {
    /* not found or invalid */
  }
  return null;
}
