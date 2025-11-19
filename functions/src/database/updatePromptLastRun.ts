import { getPgPool } from "./db-clients";
import { getProjectId } from "../utils/env";

export async function updatePromptLastRun(promptId: string, status: string) {
  console.log(`Updating prompt ${promptId} lastRun status to ${status}`);
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    const query = `
      UPDATE prompts
      SET "last_run" = NOW(), "last_run_status" = $2
      WHERE id = $1;
    `;
    const values = [promptId, status];
    await client.query(query, values);
  } catch (error) {
    console.error("Failed to update lastRun for prompt", error);
    throw error;
  } finally {
    client.release();
  }
}
