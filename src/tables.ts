// REST API for Tables: typed-column data tables (n8n Data Tables style).
// Mounted at /api/tables in src/app.ts, behind requireApiAuth (session
// cookie, OAuth bearer token, or API key).
import express, { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { parse } from "csv-parse/sync";
import * as store from "./db.ts";
import type { ColumnType, ImportError, TableColumn } from "../shared/types.ts";

const ah =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// No background-job infrastructure exists in this app — CSV import must
// finish inside one request, so cap what a single import can contain.
const CSV_MAX_BYTES = 2 * 1024 * 1024;
const CSV_MAX_ROWS = 5000;
const TYPE_SAMPLE_SIZE = 50;
const BOOL_VALUES = new Set(["true", "false", "1", "0", "yes", "no"]);

export interface ParsedCsv {
  headers: string[];
  dataRows: string[][];
}

export function parseCsv(csv: unknown, hasHeaderRow: boolean): ParsedCsv {
  if (typeof csv !== "string" || !csv.trim()) throw Object.assign(new Error("csv is required"), { status: 400 });
  if (Buffer.byteLength(csv, "utf8") > CSV_MAX_BYTES) {
    throw Object.assign(new Error(`csv exceeds the ${CSV_MAX_BYTES / (1024 * 1024)}MB limit`), { status: 400 });
  }
  const records: string[][] = parse(csv, { skip_empty_lines: true });
  if (records.length === 0) throw Object.assign(new Error("csv has no rows"), { status: 400 });
  const headers = hasHeaderRow ? records[0]! : records[0]!.map((_, i) => `Column${i + 1}`);
  const dataRows = hasHeaderRow ? records.slice(1) : records;
  if (dataRows.length > CSV_MAX_ROWS) {
    throw Object.assign(new Error(`csv exceeds the ${CSV_MAX_ROWS}-row limit`), { status: 400 });
  }
  return { headers, dataRows };
}

function inferType(values: (string | undefined)[]): ColumnType {
  const sample = values.filter((v): v is string => v !== undefined && v !== "").slice(0, TYPE_SAMPLE_SIZE);
  if (sample.length === 0) return "text";
  if (sample.every((v) => v.trim() !== "" && !Number.isNaN(Number(v)))) return "number";
  if (sample.every((v) => BOOL_VALUES.has(v.trim().toLowerCase()))) return "boolean";
  if (sample.every((v) => !Number.isNaN(Date.parse(v)))) return "date";
  return "text";
}

export interface CoercedCell {
  value: string | number | boolean | null;
  error: string | null;
}

export function coerceCell(value: string | undefined, type: ColumnType): CoercedCell {
  if (value === undefined || value === "") return { value: null, error: null };
  const raw = value.trim();
  switch (type) {
    case "number": {
      const n = Number(raw);
      return Number.isNaN(n) ? { value: null, error: "not a number" } : { value: n, error: null };
    }
    case "boolean": {
      if (!BOOL_VALUES.has(raw.toLowerCase())) return { value: null, error: "not a boolean" };
      return { value: ["true", "1", "yes"].includes(raw.toLowerCase()), error: null };
    }
    case "date":
      return Number.isNaN(Date.parse(raw)) ? { value: null, error: "not a date" } : { value: raw, error: null };
    default:
      return { value: raw, error: null };
  }
}

export function tablesRouter() {
  const router = express.Router();

  // ---- tables ----

  router.get(
    "/",
    ah(async (req, res) => {
      res.json(await store.listTables(req.userId!));
    })
  );

  router.post(
    "/",
    ah(async (req, res) => {
      const { name, description } = req.body ?? {};
      if (!name || typeof name !== "string") {
        return void res.status(400).json({ error: "name is required" });
      }
      res.status(201).json(await store.createTable(req.userId!, { name, description }));
    })
  );

  // Creates a new table from a CSV upload: header row becomes column names
  // (or Column1..N without one), types are inferred by sampling each
  // column's values. Placed before "/:id" so "import" is never captured as
  // an id.
  router.post(
    "/import",
    ah(async (req, res) => {
      const { name, csv, hasHeaderRow = true } = req.body ?? {};
      if (!name || typeof name !== "string") return void res.status(400).json({ error: "name is required" });
      const { headers, dataRows } = parseCsv(csv, hasHeaderRow);

      const table = await store.createTable(req.userId!, { name });
      const columns: TableColumn[] = [];
      for (let i = 0; i < headers.length; i++) {
        const values = dataRows.map((row) => row[i]);
        const type = inferType(values);
        const column = await store.addColumn(req.userId!, table.id, { name: headers[i] || `Column${i + 1}`, type });
        if (column && column !== "invalid_type") columns.push(column);
      }

      const errors: ImportError[] = [];
      const rows = dataRows.map((row, rowIndex) => {
        const data: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          const { value, error } = coerceCell(row[i], col.type);
          data[col.id] = value;
          if (error) errors.push({ row: rowIndex + 1, column: col.name, reason: error });
        });
        return data;
      });
      const imported = await store.bulkInsertRows(req.userId!, table.id, rows);

      res.status(201).json({ table: await store.getTable(req.userId!, table.id), imported, skipped: 0, errors });
    })
  );

  router.get(
    "/:id",
    ah(async (req, res) => {
      const table = await store.getTable(req.userId!, req.params.id!);
      table ? res.json(table) : res.status(404).json({ error: "not found" });
    })
  );

  router.patch(
    "/:id",
    ah(async (req, res) => {
      const { name, description } = req.body ?? {};
      const table = await store.updateTable(req.userId!, req.params.id!, { name, description });
      table ? res.json(table) : res.status(404).json({ error: "not found" });
    })
  );

  router.delete(
    "/:id",
    ah(async (req, res) => {
      (await store.deleteTable(req.userId!, req.params.id!))
        ? res.json({ deleted: req.params.id })
        : res.status(404).json({ error: "not found" });
    })
  );

  // ---- columns ----

  router.post(
    "/:id/columns",
    ah(async (req, res) => {
      const { name, type } = req.body ?? {};
      if (!name || typeof name !== "string") return void res.status(400).json({ error: "name is required" });
      const column = await store.addColumn(req.userId!, req.params.id!, { name, type });
      if (column === "invalid_type") {
        return void res.status(400).json({ error: "type must be one of: text, number, boolean, date" });
      }
      column ? res.status(201).json(column) : res.status(404).json({ error: "not found" });
    })
  );

  router.patch(
    "/:id/columns/:columnId",
    ah(async (req, res) => {
      const { name, type } = req.body ?? {};
      const column = await store.updateColumn(req.userId!, req.params.id!, req.params.columnId!, { name, type });
      if (column === "invalid_type") {
        return void res.status(400).json({ error: "type must be one of: text, number, boolean, date" });
      }
      column ? res.json(column) : res.status(404).json({ error: "not found" });
    })
  );

  router.delete(
    "/:id/columns/:columnId",
    ah(async (req, res) => {
      (await store.deleteColumn(req.userId!, req.params.id!, req.params.columnId!))
        ? res.json({ deleted: req.params.columnId })
        : res.status(404).json({ error: "not found" });
    })
  );

  router.put(
    "/:id/columns/reorder",
    ah(async (req, res) => {
      const { order } = req.body ?? {};
      if (!Array.isArray(order)) return void res.status(400).json({ error: "order must be an array of column ids" });
      (await store.reorderColumns(req.userId!, req.params.id!, order))
        ? res.json({ reordered: true })
        : res.status(404).json({ error: "not found" });
    })
  );

  // ---- rows ----

  router.get(
    "/:id/rows",
    ah(async (req, res) => {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
      const result = await store.listRows(req.userId!, req.params.id!, { limit, offset });
      result ? res.json(result) : res.status(404).json({ error: "not found" });
    })
  );

  router.post(
    "/:id/rows",
    ah(async (req, res) => {
      const { data } = req.body ?? {};
      if (!data || typeof data !== "object") return void res.status(400).json({ error: "data is required" });
      const row = await store.createRow(req.userId!, req.params.id!, data);
      row ? res.status(201).json(row) : res.status(404).json({ error: "not found" });
    })
  );

  router.get(
    "/:id/rows/:rowId",
    ah(async (req, res) => {
      const row = await store.getRow(req.userId!, req.params.id!, req.params.rowId!);
      row ? res.json(row) : res.status(404).json({ error: "not found" });
    })
  );

  router.patch(
    "/:id/rows/:rowId",
    ah(async (req, res) => {
      const { data } = req.body ?? {};
      if (!data || typeof data !== "object") return void res.status(400).json({ error: "data is required" });
      const row = await store.updateRow(req.userId!, req.params.id!, req.params.rowId!, data);
      row ? res.json(row) : res.status(404).json({ error: "not found" });
    })
  );

  router.delete(
    "/:id/rows/:rowId",
    ah(async (req, res) => {
      (await store.deleteRow(req.userId!, req.params.id!, req.params.rowId!))
        ? res.json({ deleted: req.params.rowId })
        : res.status(404).json({ error: "not found" });
    })
  );

  // ---- CSV import into an existing table (parse-only preview, then commit) ----

  router.post(
    "/:id/rows/import/preview",
    ah(async (req, res) => {
      const table = await store.getTable(req.userId!, req.params.id!);
      if (!table) return void res.status(404).json({ error: "not found" });
      const { csv, hasHeaderRow = true } = req.body ?? {};
      const { headers, dataRows } = parseCsv(csv, hasHeaderRow);
      res.json({ headers, sample: dataRows.slice(0, 5), rowCount: dataRows.length });
    })
  );

  router.post(
    "/:id/rows/import",
    ah(async (req, res) => {
      const table = await store.getTable(req.userId!, req.params.id!);
      if (!table) return void res.status(404).json({ error: "not found" });
      const { csv, hasHeaderRow = true, columnMapping } = req.body ?? {};
      if (!columnMapping || typeof columnMapping !== "object") {
        return void res.status(400).json({ error: "columnMapping ({csvHeader: columnId}) is required" });
      }
      const { headers, dataRows } = parseCsv(csv, hasHeaderRow);
      const columnsById = new Map(table.columns.map((c) => [c.id, c]));

      const errors: ImportError[] = [];
      const rows = dataRows.map((row, rowIndex) => {
        const data: Record<string, unknown> = {};
        headers.forEach((header, i) => {
          const columnId = columnMapping[header];
          const column = columnId && columnsById.get(columnId);
          if (!column) return;
          const { value, error } = coerceCell(row[i], column.type);
          data[column.id] = value;
          if (error) errors.push({ row: rowIndex + 1, column: column.name, reason: error });
        });
        return data;
      });
      const imported = await store.bulkInsertRows(req.userId!, req.params.id!, rows);

      res.status(201).json({ table_id: req.params.id, imported, skipped: 0, errors });
    })
  );

  return router;
}
