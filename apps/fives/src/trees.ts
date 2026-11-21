// LightGBM's trees (`learn.py`'s JSON) as flat arrays, scored without objects, and packed as
// bytes that a browser or Convex can load without the file system.

type Node = { split_feature?: number; threshold?: number; left_child?: Node; right_child?: Node; leaf_value?: number };

/**
 * Every tree's nodes in preorder, so a node's left child is the next one: its feature, −1 for a
 * leaf, its threshold, or a leaf's value, and where its right child is.
 */
export type Forest = { roots: Int32Array; feature: Int16Array; threshold: Float64Array; right: Int32Array; v: number };

/** `json`'s trees, and `v`, the version of the features they were fit to (1 for models from before there were versions). */
export function flatten(json: { tree_info: { tree_structure: Node }[]; v?: number }): Forest {
  const feature: number[] = [];
  const threshold: number[] = [];
  const right: number[] = [];
  const add = (t: Node): number => {
    const i = feature.length;
    feature.push(t.leaf_value !== undefined ? -1 : t.split_feature!);
    threshold.push(t.leaf_value ?? t.threshold!);
    right.push(0);
    if (t.leaf_value === undefined) {
      add(t.left_child!);
      right[i] = add(t.right_child!);
    }
    return i;
  };
  const roots = json.tree_info.map((t) => add(t.tree_structure));
  return { roots: Int32Array.from(roots), feature: Int16Array.from(feature), threshold: Float64Array.from(threshold), right: Int32Array.from(right), v: json.v ?? 1 };
}

export function score({ roots, feature, threshold, right }: Forest, x: ArrayLike<number>) {
  let s = 0;
  for (let i of roots) {
    for (let f = feature[i]; f >= 0; f = feature[i]) i = x[f] <= threshold[i] ? i + 1 : right[i];
    s += threshold[i];
  }
  return s;
}

/**
 * `score` of each of `xs`, which agree on their first `shared` features: each tree walks those
 * once for all of them, and its nodes stay in cache while it scores the rest.
 */
export function scoreAll({ roots, feature, threshold, right }: Forest, xs: Float64Array[], shared: number, out = new Float64Array(xs.length)) {
  out.fill(0);
  const x0 = xs[0];
  for (let r of roots) {
    for (let f = feature[r]; f >= 0 && f < shared; f = feature[r]) r = x0[f] <= threshold[r] ? r + 1 : right[r];
    if (feature[r] < 0) {
      for (let k = 0; k < xs.length; k++) out[k] += threshold[r];
      continue;
    }
    for (let k = 0; k < xs.length; k++) {
      const x = xs[k];
      let i = r;
      for (let f = feature[i]; f >= 0; f = feature[i]) i = x[f] <= threshold[i] ? i + 1 : right[i];
      out[k] += threshold[i];
    }
  }
  return out;
}

/** `forest` as base64: node and tree counts and the features' version, then thresholds, roots, right children and features. */
export function pack({ roots, feature, threshold, right, v }: Forest) {
  const bytes = new Uint8Array(16 + threshold.byteLength + roots.byteLength + right.byteLength + feature.byteLength);
  let at = 0;
  for (const a of [Int32Array.of(feature.length, roots.length, v, 0), threshold, roots, right, feature]) {
    bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at);
    at += a.byteLength;
  }
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unpack(base64: string): Forest {
  const s = atob(base64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  const [nodes, trees, v] = new Int32Array(bytes.buffer, 0, 3);
  let at = 16;
  const take = <T>(make: new (b: ArrayBuffer, o: number, n: number) => T, n: number, size: number) => {
    const a = new make(bytes.buffer, at, n);
    at += n * size;
    return a;
  };
  const threshold = take(Float64Array, nodes, 8);
  const roots = take(Int32Array, trees, 4);
  const right = take(Int32Array, nodes, 4);
  const feature = take(Int16Array, nodes, 2);
  return { roots, feature, threshold, right, v };
}
