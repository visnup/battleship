// LightGBM's trees (`learn.py`'s JSON) as flat arrays, scored without objects, and packed as
// bytes that a browser or Convex can load without the file system.

type Node = { split_feature?: number; threshold?: number; left_child?: Node; right_child?: Node; leaf_value?: number };

/**
 * Every tree's nodes in preorder, so a node's left child is the next one: its feature, −1 for a
 * leaf, its threshold, or a leaf's value, and where its right child is.
 */
export type Forest = { roots: Int32Array; feature: Int16Array; threshold: Float64Array; right: Int32Array };

export function flatten(json: { tree_info: { tree_structure: Node }[] }): Forest {
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
  return { roots: Int32Array.from(roots), feature: Int16Array.from(feature), threshold: Float64Array.from(threshold), right: Int32Array.from(right) };
}

export function score({ roots, feature, threshold, right }: Forest, x: number[]) {
  let s = 0;
  for (let i of roots) {
    for (let f = feature[i]; f >= 0; f = feature[i]) i = x[f] <= threshold[i] ? i + 1 : right[i];
    s += threshold[i];
  }
  return s;
}

/** `forest` as base64: node and tree counts, then thresholds, roots, right children and features. */
export function pack({ roots, feature, threshold, right }: Forest) {
  const bytes = new Uint8Array(8 + threshold.byteLength + roots.byteLength + right.byteLength + feature.byteLength);
  let at = 0;
  for (const a of [Int32Array.of(feature.length, roots.length), threshold, roots, right, feature]) {
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
  const [nodes, trees] = new Int32Array(bytes.buffer, 0, 2);
  let at = 8;
  const take = <T>(make: new (b: ArrayBuffer, o: number, n: number) => T, n: number, size: number) => {
    const a = new make(bytes.buffer, at, n);
    at += n * size;
    return a;
  };
  const threshold = take(Float64Array, nodes, 8);
  const roots = take(Int32Array, trees, 4);
  const right = take(Int32Array, nodes, 4);
  const feature = take(Int16Array, nodes, 2);
  return { roots, feature, threshold, right };
}
