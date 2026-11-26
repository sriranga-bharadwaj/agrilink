// Runs the exported ONNX price models (ml/export_onnx.py). No Next.js imports, so tests can use it too.
import path from "node:path";
import * as ort from "onnxruntime-node";

export type ModelSpec = {
  inputs: { categorical: string[]; numeric: string[]; derived: Record<string, string> };
  models: Record<"point" | "q10" | "q90", string>;
};

export type ModelInput = { categorical: Record<string, string>; numeric: Record<string, number> };

const sessions = new Map<string, Promise<ort.InferenceSession>>();

function session(file: string): Promise<ort.InferenceSession> {
  if (!sessions.has(file)) sessions.set(file, ort.InferenceSession.create(file));
  return sessions.get(file)!;
}

/** Log change from lag1 predicted by each requested model, for one row. */
export async function predictLogChange(
  modelsDir: string, spec: ModelSpec, input: ModelInput, which: ("point" | "q10" | "q90")[],
): Promise<Record<string, number>> {
  const feeds: Record<string, ort.Tensor> = {};
  for (const c of spec.inputs.categorical) feeds[c] = new ort.Tensor("string", [input.categorical[c]], [1, 1]);
  for (const c of spec.inputs.numeric) feeds[c] = new ort.Tensor("float32", Float32Array.from([input.numeric[c]]), [1, 1]);
  const out: Record<string, number> = {};
  for (const name of which) {
    const s = await session(path.join(modelsDir, spec.models[name]));
    const result = await s.run(feeds);
    out[name] = Number((result[s.outputNames[0]].data as Float32Array)[0]);
  }
  return out;
}
