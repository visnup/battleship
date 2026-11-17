# /// script
# dependencies = ["scikit-learn", "numpy"]
# ///
"""Fits `learn.ts`'s move scorer to the dataset's features, holding out the last 8 shards of each
player count, and writes the trees to dataset/model.json."""

import json
import sys
from pathlib import Path

from sklearn.ensemble import HistGradientBoostingRegressor
import numpy as np

features = Path(__file__).parent.parent / "dataset" / "features"
F = int(sys.argv[1]) if len(sys.argv) > 1 else 94


def load(players, seeds):
    xs, ys, ds, gs = [], [], [], []
    for s in seeds:
        base = features / f"{players}p-{s:03d}"
        y = np.fromfile(f"{base}.y", np.float32).reshape(-1, 2)
        xs.append(np.fromfile(f"{base}.x", np.float32).reshape(-1, F))
        ys.append(y[:, 0])
        ds.append(y[:, 1])
        gs.append(np.fromfile(f"{base}.g", np.int32))
    return np.concatenate(xs), np.concatenate(ys), np.concatenate(ds), np.concatenate(gs)


def centered(y, g):
    starts = np.repeat(np.cumsum(g) - g, g)
    means = np.add.reduceat(y, np.cumsum(g) - g) / g
    return (y - np.repeat(means, g)) * 100, starts


shards = sorted({int(p.stem.split("-")[1]) for p in features.glob("2p-*.x")})
train, held = shards[:-8], shards[-8:]
counts = [2, 3, 4, 5]
parts = {k: (load(k, train), load(k, held)) for k in counts if (features / f"{k}p-{shards[0]:03d}.x").exists()}

X = np.concatenate([p[0][0] for p in parts.values()])
Y = np.concatenate([centered(p[0][1], p[0][3])[0] for p in parts.values()])
Xh = np.concatenate([p[1][0] for p in parts.values()])
Yh = np.concatenate([centered(p[1][1], p[1][3])[0] for p in parts.values()])
print(f"{len(X)} moves to train on, {len(Xh)} held out")

model = HistGradientBoostingRegressor(
    learning_rate=0.1, max_iter=300, max_leaf_nodes=63, min_samples_leaf=200, early_stopping=True, n_iter_no_change=20, verbose=1
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


# Same shape as LightGBM's dump_model, which `learn.ts` reads
trees = [{"tree_structure": tree(p[0].nodes)} for p in model._predictors]
(features.parent / "model.json").write_text(json.dumps({"tree_info": trees}))

print("\nheld out, points of win chance a decision against the default's pick (best is noisy, an upper bound):")
for k, (_, (x, y, d, g)) in parts.items():
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
