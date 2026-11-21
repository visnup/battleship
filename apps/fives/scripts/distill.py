# /// script
# dependencies = ["numpy", "scikit-learn"]
# ///
"""Reads `distill.ts`'s decisions and, for each of the default's steps, fits a shallow tree that
predicts what the model does: take the trick or not, face down or up. Prints the leaves where the
model mostly does something other than the default, as candidate rules.
`uv run scripts/distill.py [dataset/distill.csv] [depth]`."""

import sys

import numpy as np
from sklearn.tree import DecisionTreeClassifier

path = sys.argv[1] if len(sys.argv) > 1 else "dataset/distill.csv"
depth = int(sys.argv[2]) if len(sys.argv) > 2 else 3
STEPS = ["busted", "leadDown", "exact", "take", "duck", "least"]
ACTS = ["ducks face up", "ducks face down", "takes face up", "takes face down"]

head = open(path).readline().strip().split(",")
data = np.loadtxt(path, delimiter=",", skiprows=1)
col = {k: data[:, i] for i, k in enumerate(head)}
features = head[: head.index("default's step")]
X = data[:, : len(features)]
default = (2 * col["default takes"] + col["default flips"]).astype(int)
model = (2 * col["model takes"] + col["model flips"]).astype(int)
total = len(data)
print(f"{total} decisions; the model's pick differs from the default's in {100 * (1 - col['same'].mean()):.1f}%\n")

found = []
for s, step in enumerate(STEPS):
    rows = col["default's step"] == s
    if rows.sum() < 1000:
        continue
    t = DecisionTreeClassifier(max_depth=depth, min_samples_leaf=max(200, total // 1000)).fit(X[rows], model[rows])
    leaf = t.apply(X[rows])
    tree = t.tree_
    # the path to each leaf, as conditions
    paths = {}

    def walk(node, conds):
        if tree.children_left[node] < 0:
            paths[node] = conds
            return
        f, th = features[tree.feature[node]], tree.threshold[node]
        walk(tree.children_left[node], conds + [f"{f} ≤ {th:g}"])
        walk(tree.children_right[node], conds + [f"{f} > {th:g}"])

    walk(0, [])
    for node, conds in paths.items():
        here = leaf == node
        m = np.bincount(model[rows][here], minlength=4)
        d = np.bincount(default[rows][here], minlength=4)
        if m.argmax() != d.argmax():
            found.append((here.sum() / total, step, conds, ACTS[d.argmax()], d.max() / here.sum(), ACTS[m.argmax()], m.max() / here.sum()))

print("| share of decisions | the default's step | when | default | model |\n| --- | --- | --- | --- | --- |")
for share, step, conds, d, dp, m, mp in sorted(found, reverse=True):
    print(f"| {100 * share:.1f}% | {step} | {', '.join(conds)} | {d} ({100 * dp:.0f}%) | {m} ({100 * mp:.0f}%) |")
