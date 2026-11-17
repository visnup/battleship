"""The move features `scripts/learn.ts extract` writes, or the payment features `paydata.ts` does,
with the last 8 shards of each player count held out, for `learn.py` and `learn_mlx.py`."""

from pathlib import Path

import numpy as np

features = Path(__file__).parent.parent / "dataset" / "features"
F = 94


def load(bases, F=F):
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


def split(directory=features, F=F):
    """Training features and centered values, and the held-out shards by player count."""
    counts = [k for k in [2, 3, 4, 5] if any(directory.glob(f"{k}p-*.x"))]
    shards = {k: sorted(directory.glob(f"{k}p-*.x")) for k in counts}
    held = {k: load([s.with_suffix("") for s in shards[k][-8:]], F) for k in counts}
    X, Y, *_ = load([s.with_suffix("") for k in counts for s in shards[k][:-8]], F)
    return X, Y, held


def report(held, predict):
    """Points of win chance a decision that `predict`'s picks gain over the default's, held out."""
    for k, (x, _, y, d, g) in held.items():
        pred = predict(x)
        starts = np.cumsum(g) - g
        pick = np.array([s + np.argmax(pred[s : s + n]) for s, n in zip(starts, g)])
        default = np.array([s + np.argmax(d[s : s + n]) for s, n in zip(starts, g)])
        diff = 100 * (y[pick] - y[default])
        best = 100 * (np.maximum.reduceat(y, starts) - y[default])
        print(
            f"  {k} players: {len(g)} decisions, model {diff.mean():+.3f} ± {2 * diff.std() / np.sqrt(len(diff)):.3f},"
            f" best {best.mean():+.3f}, agrees with default {np.mean(pick == default):.0%}",
            flush=True,
        )
