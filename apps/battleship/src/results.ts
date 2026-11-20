import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** results/, where scripts write their raw data as Parquet. */
const dir = new URL("../results/", import.meta.url);
const path = (name: string) => fileURLToPath(new URL(`${name}.parquet`, dir));

type Value = string | number | null;
type Rows = Record<string, Value>[];

/** Writes `rows` to results/`name`.parquet with columns in the first row's key order, compressed by DuckDB with zstd. */
export async function write(name: string, rows: Rows) {
  const { parquetWriteFile } = await import("hyparquet-writer");
  mkdirSync(dir, { recursive: true });
  const columnData = Object.keys(rows[0]).map((column) => {
    const data = rows.map((r) => r[column] ?? null);
    const sample = data.find((x) => x !== null);
    const type =
      typeof sample === "string" ? "STRING"
      : data.every((x) => x === null || (Number.isInteger(x) && Math.abs(x as number) < 2 ** 31)) ? "INT32"
      : "DOUBLE";
    return { name: column, data, type } as const;
  });
  const tmp = path(`${name}.tmp`);
  parquetWriteFile({ filename: tmp, columnData });
  await query(`copy (select * from read_parquet('${tmp}')) to '${path(name)}' (format parquet, compression zstd)`);
  rmSync(tmp);
}

/** SQL for results/`name`.parquet. */
export const parquet = (name: string) => `read_parquet('${path(name)}')`;

let connection: import("@duckdb/node-api").DuckDBConnection | undefined;

/** Runs `sql` in DuckDB and returns its rows as objects. */
export async function query<T = Record<string, any>>(sql: string): Promise<T[]> {
  if (!connection) {
    const { DuckDBInstance } = await import("@duckdb/node-api");
    connection = await (await DuckDBInstance.create()).connect();
  }
  return (await connection.runAndReadAll(sql)).getRowObjectsJson() as T[];
}
