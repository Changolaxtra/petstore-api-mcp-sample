import axios from 'axios';
import { env } from '../../config/env';

/**
 * Logs in to the Petstore API (GET /user/login) and caches the resulting
 * api_key in memory, so every outbound call this server makes can attach it
 * without ever handing the credential to the calling agent/end user.
 *
 * A dedicated, interceptor-free Axios instance is used here (rather than the
 * shared client in api-client.ts) to avoid that client's own api_key
 * interceptor recursively depending on this module.
 */
const loginClient = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: 5000,
});

let cachedApiKey: string | null = null;
let pendingLogin: Promise<string> | null = null;

async function login(): Promise<string> {
  const response = await loginClient.get<string>('/user/login', {
    params: {
      username: env.MCP_API_USERNAME,
      password: env.MCP_API_PASSWORD,
    },
  });
  return response.data;
}

/**
 * Returns the cached api_key, logging in first if none is cached yet.
 */
export async function getApiKey(): Promise<string> {
  if (cachedApiKey !== null) {
    return cachedApiKey;
  }
  if (pendingLogin === null) {
    pendingLogin = login()
      .then((apiKey) => {
        cachedApiKey = apiKey;
        return apiKey;
      })
      .finally(() => {
        pendingLogin = null;
      });
  }
  return pendingLogin;
}

/**
 * Drops the cached api_key, forcing the next getApiKey() call to log in
 * again. Call this after a 401 from the API (expired/invalid key).
 */
export function invalidateApiKey(): void {
  cachedApiKey = null;
}
