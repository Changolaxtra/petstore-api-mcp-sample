export type ErrorCategory = 'validation' | 'transient' | 'permanent';

export interface ToolErrorContent {
  errorCategory: ErrorCategory;
  isRetryable: boolean;
  message: string;
  attempted_query: string | null;
  partial_results: unknown;
}

export interface StructuredToolErrorBody {
  isError: true;
  content: ToolErrorContent;
}

/**
 * LeanMCP (@leanmcp/core) only lets a tool signal failure by throwing an
 * Error — it always renders that as exactly
 * `{ content: [{ type: 'text', text: 'Error: ' + error.message }], isError: true }`,
 * with no channel to attach extra fields alongside the top-level isError
 * flag (confirmed by reading @leanmcp/core@0.4.7's own request-handler
 * code: the catch branch only ever reads `error.message`).
 *
 * To still deliver the structured error body the caller needs
 * (isError/content.errorCategory/isRetryable/message/attempted_query/
 * partial_results), that body is JSON-encoded into `error.message` itself —
 * so `content[0].text` ends up as `"Error: " + JSON.stringify(body)`. A
 * caller that wants the structured fields parses the JSON after that fixed
 * "Error: " prefix; a caller that doesn't still gets a correct top-level
 * isError and a human-readable message.
 */
export function throwStructuredError(content: ToolErrorContent): never {
  const body: StructuredToolErrorBody = { isError: true, content };
  throw new Error(JSON.stringify(body));
}
