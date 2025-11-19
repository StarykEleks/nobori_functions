import { callOpenAIJson, callOpenAIWebSearch } from "./openai-client";
import { updatePromptLastRun } from "../database/updatePromptLastRun";

import { getPgPool, createRedis } from "../database/db-clients";
import { UsageTracker } from "../database/usage-tracker";
import { getMonthlyRunsLimit } from "../database/limits";
import { SavePromptResultDto } from "./save-prompt-result.dto";
import { upsertCompetitor } from "../database/competitors";

type PromptInput = { text: string; id: string };
type BrandInput = { id: string; name: string; url: string; userId: string };

const getSystemContent = (
  brandName: string,
) => `You are “BrandVisibilityScorer,” a strict analyst.
ONLY use the provided result from web search. Do not fetch or assume anything. The main brand name: ${brandName}
Respond ONLY in JSON format
Example of JSON output:
{
  "sentiment": "positive",
  "cited": [
    {
        "url": "https://amazon.com/kindle-dbs/ku/sign-up", // should be full url from sources where AI find this info
        "domain": "amazon.com",
        "brandName": "Amazon",
        isMentioned: true // if mentioned ${brandName}  in this the page,
        type: "Competitor" // Competitor, Owned, Publisher, Community, Other
    },
    {
        "url": "https://reddit.com/plus",
        "domain": "reddit.com",
        "brandName": "Reddit",
        isMentioned: true // if mentioned ${brandName}  in this the page
        type: "Community" // Competitor, Owned, Publisher, Community, Other
    }
  ]
}
Make analysis of the text in the prompt, which may be a search result snippet.
When given a single prompt, return:
- response in JSON with these fields:
- sentiment: overall sentiment towards the MAIN BRAND in the prompt (one of "positive", "neutral", "negative").
Keep it concise.`;

export class VisibilityService {
  private pgPool = getPgPool();
  private redis = createRedis();
  private usage = new UsageTracker(this.pgPool, this.redis);

  constructor() {
    // connect once per instance (Cloud Functions cold start)
    this.pgPool.connect().catch((e) => console.error("PG connect error:", e));
  }

  async GPT(userId: string, brand: BrandInput, prompts: PromptInput[]) {
    const runAt = new Date();
    const runDate = runAt.toISOString().slice(0, 10);

    const monthlyLimit = await getMonthlyRunsLimit(this.pgPool, userId);
    console.log("monthlyLimit for user", userId, "is", monthlyLimit);
    // Optional pre-sizing (avoid starting more than remaining)
    // You can remove this if you prefer per-item check only.
    const usedMap = await this.usage.getCurrent(userId, "runs", "month");
    const used = usedMap["runs"] ?? 0;
    const remaining = Math.max(0, monthlyLimit - used);
    const toProcess = Math.min(prompts.length, remaining || prompts.length); // if unlimited (0), we still process

    let processed = 0;

    for (const p of prompts.slice(0, toProcess)) {
      try {
        // Authoritative quota enforcement BEFORE running the model
        await this.usage.consumeOrThrow(
          userId,
          "runs",
          1,
          monthlyLimit,
          "month",
        );

        await updatePromptLastRun(p.id, "running");

        const search = await callOpenAIWebSearch(
          [{ role: "user", content: p.text }],
          "gpt-5",
        );
        const responseText =
          typeof search === "string" ? search : JSON.stringify(search);
        const out = await callOpenAIJson(
          [
            { role: "system", content: getSystemContent(brand.name) },
            { role: "user", content: responseText },
          ],
          "gpt-5",
        );

        await updatePromptLastRun(p.id, "completed");

        await this.savePromptRun({
          promptId: p.id,
          brandId: brand.id,
          promptText: p.text,
          runDate,
          provider: "openai-gpt",
          responseText,
          ...out,
        });

        processed++;
        console.log("Finished processed result:", processed);
      } catch (err: any) {
        console.error("RUN failed for prompt", p.id, err);
        await updatePromptLastRun(p.id, "failed");
        // If quota exceeded, stop early (optional: you could 'continue' to try next prompt)
        if (
          typeof err?.message === "string" &&
          err.message.startsWith("QUOTA_EXCEEDED")
        ) {
          console.warn(`User ${userId} quota exceeded. Stopping batch.`);
          break;
        }
        console.error("Prompt run error:", err);
      }
    }

    return {
      ok: true,
      processed,
      requested: prompts.length,
      limit: monthlyLimit,
    };
  }

  async savePromptRun(
    dto: SavePromptResultDto,
  ): Promise<{ promptRunId: string }> {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Validate prompt and brand
      const promptRes = await client.query(
        "SELECT * FROM prompts WHERE id = $1",
        [dto.promptId],
      );
      if (promptRes.rowCount === 0) throw new Error("Prompt not found");
      const prompt = promptRes.rows[0];
      if (prompt.brandId !== dto.brandId) {
        const brandRes = await client.query(
          "SELECT * FROM brands WHERE id = $1",
          [dto.brandId],
        );
        if (brandRes.rowCount === 0) throw new Error("Brand not found");
        console.log(`Validating prompt-brand match: ${prompt.brandId}`, {
          prompt,
          brandRes,
        });
        if (prompt.brandId !== brandRes.rows[0].id)
          throw new Error("promptId does not belong to provided brandId");
      }
      // Insert PromptRun
      const runDate = dto.runDate || new Date().toISOString().slice(0, 10);
      const sentiment = dto.sentiment;
      const provider = dto.provider;
      const promptRunRes = await client.query(
        `INSERT INTO "prompts_run"
           ("promptId", "brandId", "runDate", "sentiment", "provider", "responseText")
         VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING "id"`,
        [
          prompt.id,
          prompt.brandId,
          runDate,
          sentiment,
          provider,
          dto.responseText,
        ],
      );
      const promptRunId = promptRunRes.rows[0].id;
      // Insert cited pages and domains
      let citedPagesIds: string[] = [];
      if (dto.cited?.length) {
        for (const cited of dto.cited) {
          const citedPageRes = await client.query(
            `INSERT INTO "prompt_run_sources" ("promptRunId", "url", "type", "isMentioned") VALUES ($1, $2, $3, $4) RETURNING id`,
            [promptRunId, cited.url, cited.type, cited.isMentioned],
          );
          citedPagesIds.push(citedPageRes.rows[0].id);
          await client.query(
            `INSERT INTO "prompt_run_domain_citations" ("promptRunId", "domain", "isMentioned") VALUES ($1, $2, $3)`,
            [promptRunId, cited.domain, cited.isMentioned],
          );
        }
      }
      // Aggregate mentioned brands from cited pages
      const brandMentionMap = new Map();
      if (dto.cited?.length) {
        dto.cited.forEach((cited, idx) => {
          if (!cited.brandName) return;
          const key = cited.brandName.toLowerCase();
          if (!brandMentionMap.has(key)) {
            brandMentionMap.set(key, {
              brandDisplay: cited.brandName,
              domain: cited.domain || "",
              mentions: 0,
              citedPages: [],
            });
          }
          const entry = brandMentionMap.get(key);
          entry.mentions += 1;
          entry.citedPages.push(citedPagesIds[idx]);
        });
      }
      // Save PromptBrandMetric for each brand
      for (const [
        brandKey,
        { brandDisplay, domain, mentions, citedPages },
      ] of brandMentionMap.entries()) {
        const isMain = brandKey === (prompt.brand?.toLowerCase?.() || "");
        const metricRes = await client.query(
          `INSERT INTO "prompt_run_brand_metrics" ("mainBrandIdId", "promptRunId", "brandKey", "brandDisplay", "isMain", "mentions", "sentiment") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            dto.brandId,
            promptRunId,
            brandKey,
            brandDisplay,
            isMain,
            mentions,
            sentiment,
          ],
        );
        await upsertCompetitor(
          client,
          dto.brandId,
          brandKey,
          brandDisplay,
          domain,
          "suggested",
        );
        const metricId = metricRes.rows[0].id;
        // Attach citedPages to each saved metric (many-to-many)
        for (const citedPageId of citedPages) {
          await client.query(
            `INSERT INTO "prompt_run_brand_metrics_cited_pages_prompt_run_sources" ("promptRunBrandMetricsId", "promptRunSourcesId") VALUES ($1, $2)`,
            [metricId, citedPageId],
          );
        }
      }
      await client.query("COMMIT");
      return { promptRunId };
    } catch (err) {
      console.error("savePromptRun error:", err);
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}
