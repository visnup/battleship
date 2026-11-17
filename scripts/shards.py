"""The move features `scripts/learn.ts extract` writes, or the payment features `paydata.ts` does,
from one or more directories, with the last 8 shards of each player count in the last directory
held out, for `learn.py` and `learn_mlx.py`."""

from pathlib import Path

import numpy as np

features = Path(__file__).parent.parent / "dataset" / "features"


def width(base):
    """Features a row, from the sizes of a shard's files."""
    return base.with_suffix(".x").stat().st_size // (base.with_suffix(".y").stat().st_size // 2)


def load(bases):
    """Features, values less the default's in points, the values, the default's picks and group sizes."""
    F = width(bases[0])
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
    y, d, g = np.concatenate(ys), np.concatenate(ds), np.concatenate(gs)
    starts = np.cumsum(g) - g
    return X, (y - np.repeat(np.add.reduceat(y, starts) / g, g)) * 100, y, d, g


def split(*directories):
    """Training features and values, and the held-out shards by player count."""
    directories = [Path(d) for d in directories] or [features]
    shards = lambda d, k: sorted(d.glob(f"{k}p-*.x"))
    counts = [k for k in [2, 3, 4, 5] if shards(directories[-1], k)]
    held = {k: load([s.with_suffix("") for s in shards(directories[-1], k)[-8:]]) for k in counts}
    train = [s for d in directories for k in counts for s in (shards(d, k)[:-8] if d == directories[-1] else shards(d, k))]
    X, Y, *_ = load([s.with_suffix("") for s in train])
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
