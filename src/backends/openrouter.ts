import type {
  AskOptions,
  AskResult,
  CreateClientOptions,
  StreamChunk,
} from "../core/types.js";
import { NxAiApiError } from "../core/errors.js";
import { normalizeUsage } from "../core/usage.js";
import { getOpenRouterEnv } from "../env.js";

type OpenRouterConfig = NonNullable<
  Extract<CreateClientOptions, { backend: "openrouter" }>["openrouter"]
>;

type OpenRouterMessage = { role: "system" | "user" | "assistant"; content: string };

type OpenRouterRequestBody = {
  model: string;
  messages: OpenRouterMessage[];
  temperature: number;
  max_completion_tokens: number;
  stream?: boolean;
  provider?: { order: string[]; allow_fallbacks: boolean };
};

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  [k: string]: unknown;
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | null }; delta?: { content?: string | null } }>;
  usage?: OpenRouterUsage;
  model?: string;
  [k: string]: unknown;
};

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

async function* parseOpenRouterSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<StreamChunk> {
  const decoder = new TextDecoder();
  let buffer = "";
  let usageSent = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            yield { type: "done" };
            return;
          }
          try {
            const data = JSON.parse(payload) as OpenRouterResponse;
            const content = data?.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content) {
              yield { type: "text", text: content };
            }
            if (data?.usage && !usageSent) {
              usageSent = true;
              yield { type: "usage", usage: normalizeUsage(data.usage) };
            }
          } catch {
            // ignore parse errors for non-JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  yield { type: "done" };
}

export function createOpenRouterClient(
  config: Extract<CreateClientOptions, { backend: "openrouter" }>
): {
  ask(instruction: string, opts: AskOptions): Promise<AskResult>;
  askStream(instruction: string, opts: AskOptions): AsyncIterable<StreamChunk>;
  testConnection(): Promise<boolean>;
} {
  const env = getOpenRouterEnv();
  const openrouter: OpenRouterConfig = config.openrouter ?? {};
  const apiKey = openrouter.apiKey ?? env.apiKey;
  const baseUrl = (openrouter.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const appUrl = openrouter.appUrl ?? env.appUrl;
  const appName = openrouter.appName ?? env.appName;
  const allowFallbacksDefault = openrouter.allowFallbacksDefault ?? true;

  if (!apiKey) {
    throw new NxAiApiError("Missing OPENROUTER_API_KEY. Set it in .env or pass openrouter.apiKey.", {
      code: "MISSING_ENV",
    });
  }

  return {
    async ask(instruction: string, opts: AskOptions): Promise<AskResult> {
      // ... (existing code omitted for brevity in summary, but I'll replace the block)
      const model = opts.model;
      if (!model) {
        throw new NxAiApiError('OpenRouter backend requires opts.model (e.g. "openai/gpt-4o").', {
          code: "MISSING_ENV",
        });
      }

      const messages: OpenRouterMessage[] = [];
      if (opts.system) {
        messages.push({ role: "system", content: opts.system });
      }
      messages.push({ role: "user", content: instruction });

      const body: OpenRouterRequestBody = {
        model,
        messages,
        temperature: opts.temperature,
        max_completion_tokens: opts.maxTokens,
      };

      if (opts.vendor !== undefined) {
        const order = Array.isArray(opts.vendor) ? opts.vendor : [opts.vendor];
        body.provider = { order, allow_fallbacks: allowFallbacksDefault };
      }

      const url = `${baseUrl}/chat/completions`;
      const headersValue: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (appUrl) headersValue["HTTP-Referer"] = appUrl;
      if (appName) headersValue["X-OpenRouter-Title"] = appName;

      const timeoutMs = opts.timeoutMs ?? 60_000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const doFetch = async (): Promise<AskResult> => {
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: headersValue,
            body: JSON.stringify(body),
            signal: controller.signal,
          });
        } catch (e) {
          clearTimeout(timeoutId);
          if (e instanceof Error && e.name === "AbortError") {
            throw new NxAiApiError(`Request exceeded timeout of ${timeoutMs}ms`, {
              code: "TIMEOUT",
            });
          }
          throw e;
        }
        clearTimeout(timeoutId);

        let parsed: OpenRouterResponse | undefined;
        const text = await res.text();
        try {
          parsed = text ? (JSON.parse(text) as OpenRouterResponse) : undefined;
        } catch {
          // leave parsed undefined
        }

        if (!res.ok) {
          throw new NxAiApiError(
            `OpenRouter request failed: ${res.status} ${res.statusText}`,
            {
              code: "OPENROUTER_HTTP_ERROR",
              status: res.status,
              details: parsed ?? text,
            }
          );
        }

        const textOut =
          parsed?.choices?.[0]?.message?.content != null
            ? String(parsed.choices[0].message.content)
            : "";
        const usage = normalizeUsage(parsed?.usage);
        return {
          text: textOut,
          usage,
          model: parsed?.model,
          raw: parsed,
        };
      };

      return doFetch();
    },
    async *askStream(instruction: string, opts: AskOptions): AsyncIterable<StreamChunk> {
      const model = opts.model;
      if (!model) {
        throw new NxAiApiError('OpenRouter backend requires opts.model (e.g. "openai/gpt-4o").', {
          code: "MISSING_ENV",
        });
      }
      const messages: OpenRouterMessage[] = [];
      if (opts.system) {
        messages.push({ role: "system", content: opts.system });
      }
      messages.push({ role: "user", content: instruction });
      const body: OpenRouterRequestBody = {
        model,
        messages,
        temperature: opts.temperature,
        max_completion_tokens: opts.maxTokens,
        stream: true,
      };
      if (opts.vendor !== undefined) {
        const order = Array.isArray(opts.vendor) ? opts.vendor : [opts.vendor];
        body.provider = { order, allow_fallbacks: allowFallbacksDefault };
      }
      const url = `${baseUrl}/chat/completions`;
      const headersValue: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };
      if (appUrl) headersValue["HTTP-Referer"] = appUrl;
      if (appName) headersValue["X-OpenRouter-Title"] = appName;
      const timeoutMs = opts.timeoutMs ?? 60_000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: headersValue,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error && e.name === "AbortError") {
          throw new NxAiApiError(`Request exceeded timeout of ${timeoutMs}ms`, {
            code: "TIMEOUT",
          });
        }
        throw e;
      }
      clearTimeout(timeoutId);
      if (!res.ok || !res.body) {
        const text = await res.text();
        let parsed: OpenRouterResponse | undefined;
        try {
          parsed = text ? (JSON.parse(text) as OpenRouterResponse) : undefined;
        } catch {
          // ignore
        }
        throw new NxAiApiError(`OpenRouter request failed: ${res.status} ${res.statusText}`, {
          code: "OPENROUTER_HTTP_ERROR",
          status: res.status,
          details: parsed ?? text,
        });
      }
      yield* parseOpenRouterSSE(res.body.getReader());
    },
    async testConnection(): Promise<boolean> {
      const url = `${baseUrl}/auth/key`;
      const headersValue = {
        Authorization: `Bearer ${apiKey}`,
      };
      try {
        const res = await fetch(url, { headers: headersValue });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
}
