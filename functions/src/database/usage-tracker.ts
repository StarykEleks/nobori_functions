// infra/usage-tracker.ts
import dayjs from "dayjs";
import type { Pool } from "pg";
import type Redis from "ioredis";

export type Period = "hour" | "day" | "month" | "forever";

/**
 * UsageTracker
 * - SQL (usage_counters) is authoritative
 * - Redis is a read-through cache
 */
export class UsageTracker {
  constructor(
    private pg: Pool,
    private redis: Redis,
  ) {}

  private suffix(period: Period) {
    const now = dayjs();
    switch (period) {
      case "hour":
        return now.format("YYYY-MM-DDTHH");
      case "day":
        return now.format("YYYY-MM-DD");
      case "month":
        return now.format("YYYY-MM");
      case "forever":
        return "forever";
    }
  }

  private ttl(period: Period) {
    if (period === "forever") return 10 * 365 * 24 * 60 * 60; // ~10 years
    const now = dayjs();
    const end =
      period === "month"
        ? now.endOf("month")
        : period === "day"
          ? now.endOf("day")
          : now.endOf("hour");
    return Math.max(1, end.diff(now, "second"));
  }

  private redisKey(userId: string, counter: string, bucket: string) {
    return `usage:${counter}:${userId}:${bucket}`;
  }

  /** Fast read for one or many counters (not authoritative). */
  async getCurrent(
    userId: string,
    counters: string | string[],
    period: Period,
  ): Promise<Record<string, number>> {
    const bucket = this.suffix(period);
    const keys = Array.isArray(counters) ? counters : [counters];
    const redisKeys = keys.map((c) => this.redisKey(userId, c, bucket));

    const cached = await this.redis.mget(redisKeys);
    const result: Record<string, number> = {};
    const missing: string[] = [];

    keys.forEach((c, i) => {
      const raw = cached[i];
      if (raw !== null && raw !== undefined) result[c] = Number(raw);
      else missing.push(c);
    });

    if (missing.length) {
      const params: any[] = [];
      const wheres: string[] = [];
      missing.forEach((c, idx) => {
        params.push(userId, c, bucket);
        wheres.push(
          `(user_id = $${params.length - 2} AND counter = $${params.length - 1} AND period_bucket = $${params.length})`,
        );
      });

      const sql = `
        SELECT counter, value
        FROM usage_counters
        WHERE ${wheres.join(" OR ")}
      `;
      const { rows } = await this.pg.query(sql, params);

      // Map back
      for (const c of missing) {
        const row = rows.find((r) => r.counter === c);
        const val = row ? Number(row.value) : 0;
        result[c] = val;
      }

      // cache in a single pipeline
      const ttl = this.ttl(period);
      const multi = this.redis.multi();
      for (const c of missing) {
        multi.set(
          this.redisKey(userId, c, bucket),
          String(result[c]),
          "EX",
          ttl,
        );
      }
      await multi.exec();
    }

    return result;
  }

  /**
   * Authoritative consumption (increments by delta if it does not exceed limit).
   * Returns the new value after increment (number).
   * Throws on quota exceeded.
   */
  async consumeOrThrow(
    userId: string,
    counter: string,
    delta: number,
    limit: number,
    period: Period,
  ): Promise<number> {
    if (!Number.isFinite(limit)) return 0;
    if (delta <= 0) return 0;

    const bucket = this.suffix(period);
    await this.pg.query("BEGIN");
    try {
      const sel = await this.pg.query(
        `SELECT value FROM usage_counters
         WHERE user_id = $1 AND counter = $2 AND period_bucket = $3
         FOR UPDATE`,
        [userId, counter, bucket],
      );

      const current = sel.rows.length ? Number(sel.rows[0].value) : 0;
      if (current + delta > limit) {
        await this.pg.query("ROLLBACK");
        const e: any = new Error(
          `QUOTA_EXCEEDED:${counter}:${current + delta}/${limit}`,
        );
        e.code = "QUOTA_EXCEEDED";
        throw e;
      }

      if (!sel.rows.length) {
        await this.pg.query(
          `INSERT INTO usage_counters (user_id, counter, period_bucket, value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, counter, period_bucket)
           DO UPDATE SET value = usage_counters.value + EXCLUDED.value`,
          [userId, counter, bucket, delta],
        );
      } else {
        await this.pg.query(
          `UPDATE usage_counters
           SET value = value + $1
           WHERE user_id = $2 AND counter = $3 AND period_bucket = $4`,
          [delta, userId, counter, bucket],
        );
      }

      await this.pg.query("COMMIT");

      const newVal = current + delta;
      await this.redis.set(
        this.redisKey(userId, counter, bucket),
        String(newVal),
        "EX",
        this.ttl(period),
      );
      return newVal;
    } catch (err) {
      await this.pg.query("ROLLBACK");
      throw err;
    }
  }
}
