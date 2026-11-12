import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry';
import { env } from '../../config/env';
import { getApiKey, invalidateApiKey } from './auth';

interface RetriedRequestConfig extends InternalAxiosRequestConfig {
  _retriedAfterReauth?: boolean;
}

/**
 * Shared Axios client to the Petstore API — the only way this package
 * reaches packages/api (never a direct DB connection or import of its
 * internals). Centralized here per packages/mcp/CLAUDE.md's HTTP client
 * conventions.
 */
export const apiClient = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: 5000,
});

// Only retry idempotent GETs on network errors/5xx — a retried POST (e.g.
// create_pet) could otherwise create duplicate pets.
axiosRetry(apiClient, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    (error.config?.method ?? 'get').toLowerCase() === 'get' &&
    isNetworkOrIdempotentRequestError(error),
});

apiClient.interceptors.request.use(async (config) => {
  config.headers.set('api_key', await getApiKey());
  return config;
});

// If the cached api_key was rejected (expired/revoked), log in again once
// and retry the original request — the caller never sees the 401.
apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriedRequestConfig | undefined;
  if (error.response?.status === 401 && config && !config._retriedAfterReauth) {
    invalidateApiKey();
    config._retriedAfterReauth = true;
    config.headers.set('api_key', await getApiKey());
    return apiClient.request(config);
  }
  throw error;
});
