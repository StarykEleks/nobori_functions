import { JobsPublisher } from "./utils/jobs.publisher";
import { getAllActivePromptsRaw } from "./database/getActivePrompts";

export async function promptScheduler(req: any, res: any) {
  const publisher = new JobsPublisher();
  const result = await getAllActivePromptsRaw();
  const jobs: Promise<void>[] = [];
  result.forEach((prompt: any) => {
    jobs.push(
      publisher.publishJob("visibility.scheduler-run", {
        userId: prompt.createdById,
        brand: {
          id: prompt.brandId,
          name: prompt.brand_name,
          url: prompt.brand_url,
        },
        providers: ["GPT"],
        prompts: [prompt],
      }),
    );
  });
  await Promise.all(jobs);
  console.log("promptScheduler hit", new Date().toISOString());
  res.status(204).end();
}
