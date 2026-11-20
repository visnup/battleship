# /// script
# dependencies = ["duckdb"]
# ///
"""Joins `scripts/dataset.ts`'s shards into one Parquet file per player count."""

from pathlib import Path

import duckdb

placed = "STRUCT(card VARCHAR, color VARCHAR)"
# Given in full, since the default player never builds and `built` would come out as all null
columns = {
    "game": "VARCHAR",
    "game_seed": "UINTEGER",
    "players": "TINYINT",
    "seat": "TINYINT",
    "turn": "SMALLINT",
    "plays_left": "TINYINT",
    "hand": "VARCHAR[]",
    "table": f"STRUCT(hand_size TINYINT, bank VARCHAR[], props {placed}[], built {placed}[])[]",
    "draw_size": "SMALLINT",
    "pile": "VARCHAR[]",
    "moves": f"STRUCT(type VARCHAR, card VARCHAR, color VARCHAR, target TINYINT, doubles TINYINT, take {placed}, give {placed}, value DOUBLE, se DOUBLE)[]",
    "default": "SMALLINT",
    "won": "BOOLEAN",
}

data = Path(__file__).parent / "data"
for n in range(2, 6):
    out = data / f"{n}p.parquet"
    duckdb.sql(
        f"""copy (select * rename ("default" as pick) from read_json('{data}/{n}p-*.jsonl', columns = {columns}))
        to '{out}' (format parquet, compression zstd)"""
    )
    rows = duckdb.sql(f"select count(*) from '{out}'").fetchall()[0][0]
    print(f"{n}p: {rows} rows, {out.stat().st_size / 1e6:.0f} MB")
