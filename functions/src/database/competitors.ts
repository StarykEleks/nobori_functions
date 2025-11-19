import { PoolClient } from "pg";

export async function upsertCompetitor(
  client: PoolClient,
  mainBrandId: string,
  brandKey: string,
  brandDisplay: string,
  domain: string,
  status: string = "suggested",
) {
  // Check if competitor exists
  const existsRes = await client.query(
    `SELECT id FROM competitors WHERE "brandKey" = $1 AND "mainBrandId" = $2`,
    [brandKey, mainBrandId],
  );
  if (existsRes.rowCount === 0) {
    // Insert new competitor
    await client.query(
      `INSERT INTO competitors ("mainBrandId", "brandKey", "brandDisplay", "domain", "status")
       VALUES ($1, $2, $3, $4, $5)`,
      [mainBrandId, brandKey, brandDisplay, domain, status],
    );
  }
}
