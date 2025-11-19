import { GoogleAuth } from "google-auth-library";
import { getProjectId } from "../utils/env";

export async function saveRunResult(data: any) {
  const url = `https://${getProjectId()}.ew.r.appspot.com/visibility/run/results/`;
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(url);
  const res = await client.request({
    url,
    method: "POST",
    data,
  });
  return res.data;
}
