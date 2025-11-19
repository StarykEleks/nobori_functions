import { Request } from "express";

export type JobPayload = { type: string; data: any };

export async function processJob(type: string, data: any, req?: Request) {
  // put your business logic here
  switch (type) {
    case "user.welcome-email":
      // e.g., send email
      console.log("Send welcome email to:", data?.email);
      return;
    case "report.generate":
      console.log("Generate report:", data?.reportId);
      return;
    default:
      console.warn("Unknown job type:", type);
  }
}
