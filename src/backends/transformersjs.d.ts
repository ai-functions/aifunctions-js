declare module "@huggingface/transformers" {
  export function pipeline(
    task: string,
    modelId: string,
    opts?: { cache_dir?: string; progress_callback?: unknown }
  ): Promise<{
    (input: string, opts?: { max_new_tokens?: number; temperature?: number; do_sample?: boolean }): Promise<
      Array<{ generated_text?: string }> | { generated_text?: string }
    >;
  }>;
}
