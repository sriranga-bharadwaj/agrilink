// Local sentence embeddings (all-MiniLM-L6-v2, 384 dims). The model is
// downloaded once and cached; no API key needed. Shared by the app and the
// MongoDB seed/demo scripts, so it has no Next.js-only imports.
import { pipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

type Extractor = (text: string | string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let extractor: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  extractor ??= (pipeline as unknown as (task: string, model: string, opts: object) => Promise<Extractor>)(
    "feature-extraction",
    EMBEDDING_MODEL,
    { dtype: "fp32" },
  );
  return extractor;
}

// Returns L2-normalised vectors, so cosine similarity is just the dot product.
export async function embedMany(texts: string[]): Promise<number[][]> {
  const output = await (await getExtractor())(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

export async function embed(text: string): Promise<number[]> {
  return (await embedMany([text]))[0];
}
