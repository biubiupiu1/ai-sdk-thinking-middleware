export interface TextDeltaStreamPart {
  type: 'text-delta';
  textDelta?: string;
  delta?: string;
  text?: string;
  [key: string]: unknown;
}

export interface ReasoningDeltaPart {
  type: 'reasoning';
  reasoning?: {
    type?: string;
    textDelta?: string;
    text?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type LanguageModelStreamPart =
  | TextDeltaStreamPart
  | ReasoningDeltaPart
  | Record<string, unknown>;

export type LanguageModelStream =
  | AsyncIterable<LanguageModelStreamPart>
  | ReadableStream<LanguageModelStreamPart>;

export interface MiddlewareResult {
  stream?: LanguageModelStream;
  text?: string;
  reasoning?: unknown;
  [key: string]: unknown;
}

export type MiddlewareContext = Record<string, unknown>;

export type NextMiddleware = (
  context?: MiddlewareContext,
) => Promise<MiddlewareResult>;

export type Middleware = (
  context: MiddlewareContext,
  next: NextMiddleware,
) => Promise<MiddlewareResult>;

export interface ThinkingMiddlewareOptions {
  tagName?: string;
  stripReasoningFromText?: boolean;
  onReasoningDelta?: (chunk: string) => void;
  createReasoningPart?: (chunk: string) => LanguageModelStreamPart;
}

export interface SplitResult {
  text: string;
  reasoning: string;
}

export declare function createThinkingMiddleware(
  options?: ThinkingMiddlewareOptions,
): Middleware;

export declare function splitReasoningFromString(
  text: string,
  options: { startTag: string; endTag: string; keepTags?: boolean },
): SplitResult;
