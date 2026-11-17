# /// script
# dependencies = ["mlx", "numpy"]
# ///
"""A board score like `chance`: the mover's chance of winning from `learned.ts`'s `position`, fitted on
the GPU with MLX to who won each dataset game, holding out the last 8 shards of each player count.
Writes the weights to dataset/value.json, which `learned.ts` reads like `learn_mlx.py`'s."""

import json
import sys
import time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np

features = Path(__file__).parent.parent / "dataset" / "features"
F = 101
HIDDEN = int(sys.argv[1]) if len(sys.argv) > 1 else 128
EPOCHS = int(sys.argv[2]) if len(sys.argv) > 2 else 20
BATCH = 4096


def load(files):
    X = np.concatenate([np.fromfile(f.with_suffix(".b"), np.float32).reshape(-1, F) for f in files])
    w = np.concatenate([np.fromfile(f.with_suffix(".w"), np.int8) for f in files])
    keep = w >= 0
    return X[keep], w[keep].astype(np.float32)


counts = [2, 3, 4, 5]
shards = {k: sorted(features.glob(f"{k}p-*.b")) for k in counts}
held = {k: load(shards[k][-8:]) for k in counts}
X, Y = load([s for k in counts for s in shards[k][:-8]])
mean, std = X.mean(0), X.std(0) + 1e-6
print(f"{len(X)} boards to train on", flush=True)


class MLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.layers = [nn.Linear(F, HIDDEN), nn.Linear(HIDDEN, HIDDEN), nn.Linear(HIDDEN, 1)]

    def __call__(self, x):
        for layer in self.layers[:-1]:
            x = nn.relu(layer(x))
        return self.layers[-1](x).squeeze(-1)


model = MLP()
steps = EPOCHS * (len(X) // BATCH)
opt = optim.AdamW(learning_rate=optim.cosine_decay(1e-3, steps), weight_decay=1e-4)
loss_and_grad = nn.value_and_grad(model, lambda m, x, y: nn.losses.binary_cross_entropy(m(x), y, with_logits=True, reduction="mean"))
norm = lambda x: (mx.array(x) - mx.array(mean)) / mx.array(std)


def evaluate():
    for k, (x, y) in held.items():
        p = np.array(mx.sigmoid(model(norm(x))))
        ll = -np.mean(y * np.log(p + 1e-9) + (1 - y) * np.log(1 - p + 1e-9))
        base = -np.mean(y * np.log(1 / k) + (1 - y) * np.log(1 - 1 / k))
        print(f"  {k} players: log loss {ll:.4f} against {base:.4f} for 1/{k}, Brier {np.mean((p - y) ** 2):.4f}", flush=True)


t = time.time()
for epoch in range(EPOCHS):
    order = np.random.permutation(len(X))
    total = 0.0
    for i in range(len(X) // BATCH):
        idx = np.sort(order[i * BATCH : (i + 1) * BATCH])
        loss, grads = loss_and_grad(model, norm(X[idx]), mx.array(Y[idx]))
        opt.update(model, grads)
        mx.eval(model.parameters(), opt.state)
        total += loss.item()
    if (epoch + 1) % 5 == 0 or epoch == 0:
        print(f"epoch {epoch + 1}: train loss {total / (len(X) // BATCH):.4f}, {time.time() - t:.0f} s", flush=True)
        evaluate()

layers = [{"w": np.array(l.weight).tolist(), "b": np.array(l.bias).tolist()} for l in model.layers]
(features.parent / "value.json").write_text(json.dumps({"mean": mean.tolist(), "std": std.tolist(), "layers": layers}))
