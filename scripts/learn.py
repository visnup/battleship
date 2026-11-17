# /// script
# dependencies = ["lightgbm", "numpy"]
# ///
"""Fits `src/learned.ts`'s move scorer to the dataset's features, and writes the trees to
src/model.json, which `playouts` ranks moves with. `uv run scripts/learn.py [trees] [out]
[features directories…]`; with `dataset/pay`, a payment scorer on `paydata.ts`'s features.
LightGBM needs `brew install libomp`."""

import json
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np

from shards import features, report, split

X, Y, held = split(*sys.argv[3:])
Xh = np.concatenate([h[0] for h in held.values()])
Yh = np.concatenate([h[1] for h in held.values()])
print(f"{len(X)} moves to train on, {len(Xh)} held out", flush=True)

train = lgb.Dataset(X, Y, free_raw_data=False)
model = lgb.train(
    {"learning_rate": 0.1, "num_leaves": 63, "min_data_in_leaf": 200, "verbose": -1},
    train,
    num_boost_round=int(sys.argv[1]) if len(sys.argv) > 1 else 300,
    valid_sets=[lgb.Dataset(Xh, Yh, reference=train)],
    callbacks=[lgb.early_stopping(20), lgb.log_evaluation(50)],
)
out = Path(sys.argv[2]) if len(sys.argv) > 2 else features.parent.parent / "src" / "model.json"
out.write_text(json.dumps({"tree_info": [{"tree_structure": t["tree_structure"]} for t in model.dump_model(num_iteration=model.best_iteration)["tree_info"]]}))

print("\nheld out, points of win chance a decision against the default's pick (best is noisy, an upper bound):")
report(held, lambda x: model.predict(x, num_iteration=model.best_iteration))
