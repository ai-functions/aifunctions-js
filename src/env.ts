/**
 * Reads OpenRouter-related env vars. Does not throw; returns undefined for missing values.
 */
export function getOpenRouterEnv(): {
  apiKey: string | undefined;
  appUrl: string | undefined;
  appName: string | undefined;
} {
  return {
    apiKey: process.env.OPENROUTER_API_KEY,
    appUrl: process.env.OPENROUTER_APP_URL,
    appName: process.env.OPENROUTER_APP_NAME,
  };
}
