# /// script
# dependencies = ["scikit-learn", "numpy"]
# ///
"""Fits `src/learned.ts`'s move scorer to the dataset's features, holding out the last 8 shards of each
player count, and writes the trees to src/model.json, which `playouts` ranks moves with."""

import json
import sys
from pathlib import Path

from sklearn.ensemble import HistGradientBoostingRegressor
import numpy as np

features = Path(__file__).parent.parent / "dataset" / "features"
F = int(sys.argv[1]) if len(sys.argv) > 1 else 94


def load(bases):
    """Features, centered values, the default's picks and group sizes, read straight into one array."""
    sizes = [(b.with_suffix(".x").stat().st_size // 4 // F) for b in bases]
    X = np.empty((sum(sizes), F), np.float32)
    ys, ds, gs, i = [], [], [], 0
    for b, n in zip(bases, sizes):
        X[i : i + n] = np.fromfile(b.with_suffix(".x"), np.float32).reshape(-1, F)
        y = np.fromfile(b.with_suffix(".y"), np.float32).reshape(-1, 2)
        ys.append(y[:, 0])
        ds.append(y[:, 1])
        gs.append(np.fromfile(b.with_suffix(".g"), np.int32))
        i += n
    y, g = np.concatenate(ys), np.concatenate(gs)
    starts = np.cumsum(g) - g
    return X, (y - np.repeat(np.add.reduceat(y, starts) / g, g)) * 100, y, np.concatenate(ds), g


counts = [k for k in [2, 3, 4, 5] if any(features.glob(f"{k}p-*.x"))]
shards = {k: sorted(features.glob(f"{k}p-*.x")) for k in counts}
held = {k: load([s.with_suffix("") for s in shards[k][-8:]]) for k in counts}
X, Y, *_ = load([s.with_suffix("") for k in counts for s in shards[k][:-8]])
Xh = np.concatenate([h[0] for h in held.values()])
Yh = np.concatenate([h[1] for h in held.values()])
print(f"{len(X)} moves to train on, {len(Xh)} held out", flush=True)

model = HistGradientBoostingRegressor(
    learning_rate=0.1, max_iter=int(sys.argv[2]) if len(sys.argv) > 2 else 300, max_leaf_nodes=63, min_samples_leaf=200, early_stopping=True, n_iter_no_change=20, verbose=1
).fit(X, Y, X_val=Xh, y_val=Yh)


def tree(nodes, i=0):
    n = nodes[i]
    if n["is_leaf"]:
        return {"leaf_value": float(n["value"])}
    return {
        "split_feature": int(n["feature_idx"]),
        "threshold": float(n["num_threshold"]),
        "left_child": tree(nodes, n["left"]),
        "right_child": tree(nodes, n["right"]),
    }


# Same shape as LightGBM's dump_model, which `learned.ts` reads
trees = [{"tree_structure": tree(p[0].nodes)} for p in model._predictors]
Path(sys.argv[3] if len(sys.argv) > 3 else features.parent.parent / "src" / "model.json").write_text(json.dumps({"tree_info": trees}))

print("\nheld out, points of win chance a decision against the default's pick (best is noisy, an upper bound):")
for k, (x, _, y, d, g) in held.items():
    pred = model.predict(x)
    starts = np.cumsum(g) - g
    model_v, default_v, best_v = [], [], []
    for s, n in zip(starts, g):
        v = y[s : s + n]
        model_v.append(v[np.argmax(pred[s : s + n])])
        default_v.append(v[np.argmax(d[s : s + n])])
        best_v.append(v.max())
    model_v, default_v, best_v = map(np.array, (model_v, default_v, best_v))
    diff = 100 * (model_v - default_v)
    print(
        f"{k} players: {len(g)} decisions, model {diff.mean():+.3f} ± {2 * diff.std() / np.sqrt(len(diff)):.3f},"
        f" best {100 * (best_v - default_v).mean():+.3f}, agrees with default {np.mean(model_v == default_v):.0%}"
    )
