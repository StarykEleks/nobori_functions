import { callOpenAIJson, callOpenAIWebSearch } from "./openai-client";
import { updatePromptLastRun } from "../database/updatePromptLastRun";

import { getPgPool, createRedis } from "../database/db-clients";
import { UsageTracker } from "../database/usage-tracker";
import { getMonthlyRunsLimit } from "../database/limits";
import { SavePromptResultDto } from "./save-prompt-result.dto";
import { upsertCompetitor } from "../database/competitors";
import { VisabilityCheckPubSubMessage } from "../visabilityCheck";
import { gptBrowser } from "../apis/api";

export type PromptInput = { text: string; id: string };
export type BrandInput = {
  id: string;
  name: string;
  url: string;
  userId: string;
};

const getSystemContent = (
  brandName: string,
) => `You are “BrandVisibilityScorer,” a strict analyst.
This is response from prompt run, I need to found all cited pages, cited domains, find urls and check if main brand was mentioned. 
The main brand name: ${brandName}

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

  async visabilityProvider(messageData: VisabilityCheckPubSubMessage) {
    const { providers } = messageData.data;

    let processed = 0;

    const runs: any[] = [];
    for (const provider of providers.slice(0)) {
      switch (provider) {
        case "GPT": {
          runs.push(this.limitGuard(messageData.data, this.GPT, "openai-gpt"));
          break;
        }
        case "GoogleOverview":
        case "PerplexityAI":
        case "BingAI":
        default:
          console.log(`Provider ${provider} not implemented yet.`);
      }
    }

    const results = await Promise.all(runs);
    console.log("Finished with:", results.length);
  }

  private async visabilityProcessing(
    responseText: string,
    prompt: PromptInput,
    brand: BrandInput,
    provider: string,
  ) {
    const runAt = new Date();
    const runDate = runAt.toISOString().slice(0, 10);
    const out = await callOpenAIJson(
      [
        { role: "system", content: getSystemContent(brand.name) },
        { role: "user", content: responseText },
      ],
      "gpt-5",
    );

    await updatePromptLastRun(prompt.id, "completed");

    await this.savePromptRun({
      promptId: prompt.id,
      brandId: brand.id,
      promptText: prompt.text,
      runDate,
      provider,
      responseText,
      ...out,
    });
  }

  async GPT(prompt: PromptInput) {
    try {
      const result = await gptBrowser(prompt.text);
      // @ts-ignore
      return result?.answer_html;
    } catch (e) {
      return this.apiGPT(prompt);
    }
  }

  private async limitGuard(
    data: {
      userId: string;
      brand: BrandInput;
      prompts: PromptInput[];
    },
    runFunction: Function,
    provider: string,
  ) {
    const { prompts, userId } = data;
    const monthlyLimit = await getMonthlyRunsLimit(this.pgPool, userId);
    console.log("monthlyLimit for user", userId, "is", monthlyLimit);
    const usedMap = await this.usage.getCurrent(userId, "runs", "month");
    const used = usedMap["runs"] ?? 0;
    const remaining = Math.max(0, monthlyLimit - used);
    const toProcess = Math.min(prompts.length, remaining || prompts.length);
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

        const runResult = await runFunction(p);
        const responseText =
          typeof runResult === "string" ? runResult : JSON.stringify(runResult);
        await this.visabilityProcessing(responseText, p, data.brand, provider);
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

      return {
        ok: true,
        requested: prompts.length,
        limit: monthlyLimit,
      };
    }
  }

  async apiGPT(prompt: PromptInput) {
    const runResult = await callOpenAIWebSearch(
      [{ role: "user", content: prompt.text }],
      "gpt-5",
    );
    return runResult;
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
