# ONNX export check

ONNX tree ensembles keep split thresholds in float32 (skl2onnx cannot export this model in float64), so inputs that sit exactly on a threshold can take the other branch. The exported models were run on the whole test block and compared with sklearn. **The app serves the ONNX models, and its parity tests use the ONNX outputs as ground truth.**

| model | test rows | rows differing > 1e-4 (log) | max abs diff (log) | mean abs diff (log) |
|---|---|---|---|---|
| point | 5076 | 116 | 0.0453 | 0.000110 |
| q10 | 5076 | 341 | 0.0114 | 0.000199 |
| q90 | 5076 | 240 | 0.0196 | 0.000180 |

Test MAE of the point forecast: ONNX Rs 4.409/kg vs sklearn Rs 4.408/kg.
