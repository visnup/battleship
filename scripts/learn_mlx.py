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

from shards import F, features, report, split

HIDDEN = int(sys.argv[1]) if len(sys.argv) > 1 else 256
EPOCHS = int(sys.argv[2]) if len(sys.argv) > 2 else 4
BATCH = 8192

X, Y, held = split()
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
    report(held, predict)

layers = [{"w": np.array(l.weight).tolist(), "b": np.array(l.bias).tolist()} for l in model.layers]
Path(sys.argv[3] if len(sys.argv) > 3 else features.parent / "mlp.json").write_text(json.dumps({"mean": mean.tolist(), "std": std.tolist(), "layers": layers}))
