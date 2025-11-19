import { Pool } from "pg";
import Redis from "ioredis";
import { getProjectId } from "../utils/env";

let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    pool = new Pool({
      user: process.env.DB_USER,
      host:
        process.env.DB_HOST ||
        `/cloudsql/${getProjectId()}:europe-west1:${getProjectId()}`,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      ssl: false,
      max: 50, // adjust as needed
      maxUses: 50,
    });
  }
  return pool;
}

export function createRedis(): Redis {
  return new Redis(`redis://${process.env.REDIS_HOST || "localhost"}:6379`, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
  });
}
