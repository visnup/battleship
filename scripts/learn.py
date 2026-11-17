# /// script
# dependencies = ["scikit-learn", "numpy"]
# ///
"""Fits `src/learned.ts`'s move scorer to the dataset's features, and writes the trees to
src/model.json, which `playouts` ranks moves with. `uv run scripts/learn.py [trees] [out]`, or
with `pay` last, a payment scorer on `paydata.ts`'s features."""

import json
import sys
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor

from shards import features, report, split

X, Y, held = split(features.parent / "pay", 27) if sys.argv[3:] == ["pay"] else split()
Xh = np.concatenate([h[0] for h in held.values()])
Yh = np.concatenate([h[1] for h in held.values()])
print(f"{len(X)} moves to train on, {len(Xh)} held out", flush=True)

model = HistGradientBoostingRegressor(
    learning_rate=0.1, max_iter=int(sys.argv[1]) if len(sys.argv) > 1 else 300, max_leaf_nodes=63, min_samples_leaf=200, early_stopping=True, n_iter_no_change=20, verbose=1
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
Path(sys.argv[2] if len(sys.argv) > 2 else features.parent.parent / "src" / "model.json").write_text(json.dumps({"tree_info": trees}))

print("\nheld out, points of win chance a decision against the default's pick (best is noisy, an upper bound):")
report(held, model.predict)
