import * as admin from "firebase-admin";
import { getRemoteConfig } from "firebase-admin/remote-config";
import { getCredentialsKeyFilename, getProjectId } from "../utils/env";

export type PlansMap = Record<
  string,
  Record<string, number | boolean | string>
>;

/**
 * Initialize once per process (Cloud Functions cold start).
 * Uses GOOGLE_APPLICATION_CREDENTIALS / ADC by default.
 */
function getOrInitApp() {
  const apps = admin.apps;
  return apps.length
    ? apps[0]
    : admin.initializeApp({
        projectId: getProjectId(),
        credential: admin.credential.cert(getCredentialsKeyFilename()),
      });
}

function tryParse(raw: string): any {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Load `_plans` from Remote Config (Server) and normalize to { [planId]: { ...limits } } */
export async function loadGroupFromRC(
  prefix: string = "plans_",
): Promise<PlansMap> {
  // @ts-ignore
  const rc = getRemoteConfig(getOrInitApp());
  const template: any = await rc.getServerTemplate();

  //@ts-ignore
  const params =
    (template as any).parameters ??
    (template as any).cache?.parameters ??
    (template as any).data?.parameters ??
    {};

  const result: Record<string, any> = {};
  for (const [key, param] of Object.entries(params)) {
    if (!key.startsWith(prefix)) continue;
    const raw = (param as any).defaultValue?.value ?? "";
    result[key] = tryParse(raw);
  }

  if (Object.keys(result).length === 0)
    console.warn(`No Remote Config params found with prefix "${prefix}"`);
  return result;
}
