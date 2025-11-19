// infra/limits.ts
import type { Pool } from "pg";
import { loadGroupFromRC } from "./remote-config";

export type SqlUser = { id: string; tier: string; expired_at: string | null };

/** Load the user row with tier & expiry (adjust the column names/table if yours differ). */
export async function getSqlUser(pg: Pool, userId: string): Promise<SqlUser> {
  const q = `
    SELECT id, tier, expired_at
    FROM users
    WHERE id = $1
    LIMIT 1
  `;
  const { rows } = await pg.query(q, [userId]);
  if (!rows.length) throw new Error(`User ${userId} not found`);
  return {
    id: rows[0].id,
    tier: rows[0].tier,
    expired_at: rows[0].expired_at,
  };
}

/** Normalize planId (handle trials/expired). Adjust the fallback plan id ('1') if needed. */
function resolvePlanId(user: SqlUser): string {
  if (user.tier === "trial") return "1";
  return user.tier;
}

/** Get *all* limits for a given user (from RC _plans + user's plan). */
export async function getUserLimits(
  pg: Pool,
  userId: string,
): Promise<Record<string, any>> {
  const user = await getSqlUser(pg, userId);
  const plansObj = await loadGroupFromRC();
  const planId = resolvePlanId(user);
  const plans = Object.keys(plansObj).map((key) => ({ ...plansObj[key] }));
  const plan = // @ts-ignore
    plans.find((p) => `${p["id"]}` === `${planId}`) || {};
  return plan ?? {};
}

/** Convenience: get numeric runs.monthly (returns 0 if missing/non-numeric). */
export async function getMonthlyRunsLimit(
  pg: Pool,
  userId: string,
): Promise<number> {
  const plan = await getUserLimits(pg, userId);
  const v = Number(plan.limits["runs.monthly"]);
  return Number.isFinite(v) ? v : 0;
}
