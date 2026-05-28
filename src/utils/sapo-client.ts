import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import type { Config } from "../config/index.js";
import { getSharedRateLimiter, type RateLimiter } from "./rate-limiter.js";
import {
  SapoError,
  SapoNotFoundError,
  SapoPermissionError,
  SapoRateLimitError,
  SapoValidationError,
} from "./sapo-error.js";

export class SapoClient {
  private readonly http: AxiosInstance;

  constructor(config: Config, private readonly limiter: RateLimiter) {
    this.http = axios.create({
      baseURL: `${config.sapoStoreUrl}/admin`,
      auth: {
        username: config.sapoApiKey,
        password: config.sapoApiSecret,
      },
      headers: { "Content-Type": "application/json" },
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err: unknown) => {
        if (axios.isAxiosError(err) && err.response) {
          const { status, data, headers } = err.response;
          const message: string =
            (data as Record<string, string>)?.error ??
            (data as Record<string, string>)?.message ??
            err.message;

          switch (status) {
            case 403:
              return Promise.reject(
                new SapoPermissionError(
                  message,
                  "Go to SAPO Admin → Apps → [App Name] → Permissions to enable the required permission.",
                ),
              );
            case 404:
              return Promise.reject(new SapoNotFoundError(message));
            case 429: {
              const retryAfter = headers["retry-after"]
                ? Number(headers["retry-after"])
                : undefined;
              return Promise.reject(new SapoRateLimitError(retryAfter));
            }
            case 422:
              return Promise.reject(new SapoValidationError(message));
            default:
              return Promise.reject(new SapoError(message, status));
          }
        }
        return Promise.reject(err);
      },
    );
  }

  get<T = unknown>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.limiter.schedule(() => this.http.get<T>(path, config));
  }

  post<T = unknown>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.limiter.schedule(() => this.http.post<T>(path, data, config));
  }

  put<T = unknown>(
    path: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.limiter.schedule(() => this.http.put<T>(path, data, config));
  }

  delete<T = unknown>(
    path: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.limiter.schedule(() => this.http.delete<T>(path, config));
  }
}

// Module-level singleton — shared across all createSapoClient() calls
const _limiter = getSharedRateLimiter();

export function createSapoClient(config: Config): SapoClient {
  return new SapoClient(config, _limiter);
}

export { resetBucketForTesting } from "./rate-limiter.js";
