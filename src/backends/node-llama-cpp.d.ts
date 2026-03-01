declare module "node-llama-cpp" {
  export function getLlama(): Promise<{
    loadModel(opts: { modelPath: string }): Promise<{
      tokenize(text: string): { length: number } & unknown[];
      createContext(opts?: { contextSize?: number; threads?: number }): Promise<{
        getSequence(): {
          evaluate(tokens: unknown, opts?: { temperature?: number }): AsyncIterable<number>;
        };
      }>;
      detokenize(tokens: number[]): string;
    }>;
  }>;
}
