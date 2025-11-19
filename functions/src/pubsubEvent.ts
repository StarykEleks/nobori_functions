import { CloudEvent } from "cloudevents";
import { processJob, JobPayload } from "./jobProcessor";

type MessagePublishedData = {
  message?: { data?: string };
};

export async function workerPubsub(cloudEvent: CloudEvent<MessagePublishedData>) {
  // @ts-ignore
  const json = Buffer.from(cloudEvent.data, "base64").toString("utf8");
  console.log("json", json);

  const { type, data } = JSON.parse(json) as JobPayload;
  console.info(`Processing job type=${type}`, data);
  await processJob(type, data);
  return {
    status: "ok",
    data: ["1,2,3"]
  };
}
