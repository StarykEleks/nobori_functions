import express from "express";
import { VisibilityService } from "./visability/visibility.service";

export const tasksApp = express();
tasksApp.use(express.json());

tasksApp.post("*", async (req: any, res: any) => {
  try {
    console.log("Task request type:", req?.body);
    const pubsubMessage = req.body?.message;
    if (!pubsubMessage || !pubsubMessage.data) {
      console.error("No Pub/Sub message data received", req.body);
      return res.status(400).json({ error: "No message data" });
    }
    const messageData: any = JSON.parse(atob(pubsubMessage.data));
    console.log("Decoded message data:", messageData.data);
    const service = new VisibilityService();
    const result = await service.GPT(
      messageData.data.userId,
      messageData.data.brand,
      messageData.data.prompts,
    );
    console.log("Finished with:", result);
    res.status(200).json({ ok: true, result });
  } catch (e: any) {
    console.log("Task error:", e?.message || e);
    res.status(500).json({ error: "Task failed" }); // triggers retry
  }
});

// Export a (req, res) handler for Functions Gen2
export const visabilityCheck = (req: any, res: any) => tasksApp(req, res);
