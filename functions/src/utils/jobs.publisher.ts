import { PubSub } from "@google-cloud/pubsub";
import { getCredentialsKeyFilename, getProjectId } from "./env";
import fs from "fs";
import { GoogleAuth } from "google-auth-library";

type JobPayload = { type: string; data: unknown };

export class JobsPublisher {
  private pubsub?: PubSub;

  private topicName(topicName: string = process.env.PUBSUB_TOPIC || "jobs-topic") {
    return `projects/${getProjectId()}/topics/${topicName}`;
  }

  async publishJob<T = unknown>(type: string, data: T, topicName?: string) {
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
    const topic = this.pubsub.topic(this.topicName(topicName));
    console.log("topic", topic);
    console.log("message", JSON.stringify(msg));
    await topic.publishMessage({
      json: msg,
      attributes: { type },
    });
  }
}
