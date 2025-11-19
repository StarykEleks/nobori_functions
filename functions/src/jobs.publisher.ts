import { PubSub } from "@google-cloud/pubsub";
import { getCredentialsKeyFilename, getProjectId } from "./utils/env";
import fs from "fs";
import { GoogleAuth } from "google-auth-library";

type JobPayload = { type: string; data: unknown };

export class JobsPublisher {
  private pubsub?: PubSub;

  private get topicName() {
    return `projects/${getProjectId()}/topics/${process.env.PUBSUB_TOPIC || "jobs-topic"}`;
  }

  async publishJob<T = unknown>(type: string, data: T) {
    const credentialsPath = getCredentialsKeyFilename();
    if (!fs.existsSync(credentialsPath)) {
      throw new Error(`Service account file not found: ${credentialsPath}`);
    }

    const auth = new GoogleAuth({
      keyFilename: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/pubsub"],
    });

    this.pubsub = new PubSub({
      projectId: getProjectId(),
      // @ts-ignore
      auth,
    });

    const msg: JobPayload = { type, data };
    const topic = this.pubsub.topic(this.topicName);
    console.log("topic", topic);
    console.log("message", JSON.stringify(msg));
    await topic.publishMessage({
      json: msg,
      attributes: { type },
    });
  }
}
