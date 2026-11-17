# /// script
# dependencies = ["mlx", "numpy"]
# ///
"""`learn.py`'s move scorer as a small neural network, trained on the GPU with MLX, on the same
features and held-out shards. Writes the weights to dataset/mlp.json."""

import json
import sys
import time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np

features = Path(__file__).parent.parent / "dataset" / "features"
F = 94
HIDDEN = int(sys.argv[1]) if len(sys.argv) > 1 else 256
EPOCHS = int(sys.argv[2]) if len(sys.argv) > 2 else 4
BATCH = 8192


def load(bases):
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


counts = [2, 3, 4, 5]
shards = {k: sorted(features.glob(f"{k}p-*.x")) for k in counts}
held = {k: load([s.with_suffix("") for s in shards[k][-8:]]) for k in counts}
X, Y, *_ = load([s.with_suffix("") for k in counts for s in shards[k][:-8]])
mean, std = X[:: 97].mean(0), X[:: 97].std(0) + 1e-6
print(f"{len(X)} moves to train on", flush=True)


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
opt = optim.AdamW(learning_rate=optim.cosine_decay(2e-3, steps), weight_decay=1e-4)
loss_and_grad = nn.value_and_grad(model, lambda m, x, y: nn.losses.mse_loss(m(x), y))


@mx.compile
def norm(x):
    return (x - mx.array(mean)) / mx.array(std)


def predict(x):
    return np.concatenate([np.array(model(norm(mx.array(x[i : i + 65536])))) for i in range(0, len(x), 65536)])


def evaluate():
    for k, (x, _, y, d, g) in held.items():
        pred = predict(x)
        starts = np.cumsum(g) - g
        pick = np.array([s + np.argmax(pred[s : s + n]) for s, n in zip(starts, g)])
        default = np.array([s + np.argmax(d[s : s + n]) for s, n in zip(starts, g)])
        diff = 100 * (y[pick] - y[default])
        print(f"  {k} players: model {diff.mean():+.3f} ± {2 * diff.std() / np.sqrt(len(diff)):.3f}, agrees with default {np.mean(pick == default):.0%}", flush=True)


t = time.time()
for epoch in range(EPOCHS):
    order = np.random.permutation(len(X))
    total = 0.0
    for i in range(len(X) // BATCH):
        idx = np.sort(order[i * BATCH : (i + 1) * BATCH])
        loss, grads = loss_and_grad(model, norm(mx.array(X[idx])), mx.array(Y[idx]))
        opt.update(model, grads)
        mx.eval(model.parameters(), opt.state)
        total += loss.item()
    print(f"epoch {epoch + 1}: train loss {total / (len(X) // BATCH):.3f}, {time.time() - t:.0f} s", flush=True)
    evaluate()

layers = [{"w": np.array(l.weight).tolist(), "b": np.array(l.bias).tolist()} for l in model.layers]
(features.parent / "mlp.json").write_text(json.dumps({"mean": mean.tolist(), "std": std.tolist(), "layers": layers}))
