import { GoogleAuth } from "google-auth-library";
// import { getProjectId } from "../utils/env";

export async function gptBrowser(prompt: string) {
  const url = `https://playwright-chatgpt-67671928053.europe-west1.run.app/run`;
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(url);
  const res = await client.request({
    url,
    method: "POST",
    data: {
      prompt,
    },
  });
  return res.data;
}
