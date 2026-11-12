import { AxiosError, isAxiosError } from 'axios';
import { throwStructuredError } from './tool-error';

interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
}

function extractMessage(data: unknown): string | undefined {
  if (typeof data === 'string') {
    return data;
  }
  if (data && typeof data === 'object' && 'message' in data) {
    const { message } = data as ApiErrorBody;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    return message;
  }
  return undefined;
}

/**
 * Maps an Axios failure from calling the Pet Store API into a structured
 * tool error (see tool-error.ts) and throws it — so the MCP layer never
 * surfaces a raw Axios exception/stack trace to the calling agent
 * (packages/mcp/CLAUDE.md), and the agent still gets errorCategory/
 * isRetryable/attempted_query alongside a human-readable message.
 */
export function throwApiCallError(error: unknown, attemptedQuery: string): never {
  if (isAxiosError(error)) {
    const axiosError = error as AxiosError;
    if (axiosError.response) {
      const detail = extractMessage(axiosError.response.data) ?? axiosError.message;
      if (axiosError.response.status >= 500) {
        throwStructuredError({
          errorCategory: 'transient',
          isRetryable: true,
          message: `The Pet Store API failed to process the request (status ${axiosError.response.status}). Try again later. Detail: ${detail}`,
          attempted_query: attemptedQuery,
          partial_results: null,
        });
      }
      throwStructuredError({
        errorCategory: 'validation',
        isRetryable: false,
        message: `The Pet Store API rejected the request (status ${axiosError.response.status}): ${detail}`,
        attempted_query: attemptedQuery,
        partial_results: null,
      });
    }
    throwStructuredError({
      errorCategory: 'transient',
      isRetryable: true,
      message: 'Could not reach the Pet Store API. The service may be starting up or unavailable.',
      attempted_query: attemptedQuery,
      partial_results: null,
    });
  }
  throwStructuredError({
    errorCategory: 'permanent',
    isRetryable: false,
    message:
      error instanceof Error
        ? error.message
        : 'An unexpected error occurred while creating the pet.',
    attempted_query: attemptedQuery,
    partial_results: null,
  });
}
