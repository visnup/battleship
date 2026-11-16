# /// script
# dependencies = ["polars"]
# ///
"""Joins `scripts/dataset.ts`'s shards into one Parquet file per player count."""

from pathlib import Path

import polars as pl

data = Path(__file__).parent / "data"
for n in range(2, 6):
    df = pl.scan_ndjson(data / f"{n}p-*.jsonl", infer_schema_length=None).collect()
    df.write_parquet(data / f"{n}p.parquet", compression="zstd")
    print(f"{n}p: {df.height} rows, {(data / f'{n}p.parquet').stat().st_size / 1e6:.0f} MB")
