import express from "express";
import {
  BrandInput,
  PromptInput,
  VisibilityService,
} from "./visability/visibility.service";
import { getMonthlyRunsLimit } from "./database/limits";

export const tasksApp = express();
tasksApp.use(express.json());

export type VisabilityCheckPubSubMessage = {
  data: {
    userId: string;
    brand: BrandInput;
    providers: string[];
    prompts: PromptInput[];
  };
};

tasksApp.post("*", async (req: any, res: any) => {
  try {
    console.log("Task request type:", req?.body);
    const pubsubMessage = req.body?.message;
    if (!pubsubMessage || !pubsubMessage.data) {
      console.error("No Pub/Sub message data received", req.body);
      return res.status(400).json({ error: "No message data" });
    }
    const messageData: VisabilityCheckPubSubMessage = JSON.parse(
      atob(pubsubMessage.data),
    );
    const service = new VisibilityService();
    const results = await service.visabilityProvider(messageData);
    res.status(200).json({ ok: true, results });
  } catch (e: any) {
    console.log("Task error:", e?.message || e);
    res.status(500).json({ error: "Task failed" }); // triggers retry
  }
});

// Export a (req, res) handler for Functions Gen2
export const visabilityCheck = (req: any, res: any) => tasksApp(req, res);
