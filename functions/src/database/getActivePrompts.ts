import { getPgPool } from "./db-clients";

export async function getAllActivePromptsRaw() {
  console.log("getAllActivePromptsRaw called");
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT prompts.*, brands.name as brand_name, brands.url as brand_url
       FROM prompts
       JOIN brands ON prompts."brandId" = brands.id
       WHERE prompts.is_active = true
         AND prompts."last_run" < NOW() - INTERVAL '24 HOURS'
      LIMIT 50;`,
    );
    console.log(
      `getAllActivePromptsRaw called - found ${res.rows.length} prompts`,
    );
    return res.rows;
  } finally {
    client.release();
  }
}
