import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, normalize, resolve, sep } from "node:path"
import { DatabaseSync } from "node:sqlite"

type BoundValue = ArrayBuffer | ArrayBufferView | bigint | boolean | null | number | string

type D1Meta = {
  changed_db: boolean
  changes: number
  duration: number
  last_row_id: number
  rows_read: number
  rows_written: number
  size_after: number
}

type D1Result = {
  success: boolean
  results: Record<string, unknown>[]
  meta: D1Meta
}

function dataDirectory() {
  const configured = process.env.ERASER_DESKTOP_DATA_DIR
  if (!configured) throw new Error("ERASER_DESKTOP_DATA_DIR is missing")
  mkdirSync(configured, { recursive: true })
  return configured
}

function sqliteValue(value: BoundValue) {
  if (typeof value === "boolean") return value ? 1 : 0
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return value
}

function emptyMeta(startedAt: number, changes = 0, lastRowId = 0): D1Meta {
  return {
    changed_db: changes > 0,
    changes,
    duration: performance.now() - startedAt,
    last_row_id: lastRowId,
    rows_read: 0,
    rows_written: changes,
    size_after: 0,
  }
}

class LocalD1PreparedStatement {
  readonly #database: DatabaseSync
  readonly #query: string
  readonly #values: BoundValue[]

  constructor(database: DatabaseSync, query: string, values: BoundValue[] = []) {
    this.#database = database
    this.#query = query
    this.#values = values
  }

  bind(...values: BoundValue[]) {
    return new LocalD1PreparedStatement(this.#database, this.#query, values)
  }

  #statement() {
    const statement = this.#database.prepare(this.#query)
    statement.setAllowBareNamedParameters(true)
    return statement
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.#statement().get(...this.#values.map(sqliteValue)) as Record<string, unknown> | undefined
    if (!row) return null
    return (column ? row[column] : row) as T
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result & { results: T[] }> {
    const startedAt = performance.now()
    const results = this.#statement().all(...this.#values.map(sqliteValue)) as T[]
    return {
      success: true,
      results,
      meta: { ...emptyMeta(startedAt), rows_read: results.length },
    }
  }

  async run(): Promise<D1Result> {
    const startedAt = performance.now()
    const result = this.#statement().run(...this.#values.map(sqliteValue))
    return {
      success: true,
      results: [],
      meta: emptyMeta(startedAt, Number(result.changes), Number(result.lastInsertRowid)),
    }
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
    const statement = this.#statement()
    const rows = statement.all(...this.#values.map(sqliteValue)) as Record<string, unknown>[]
    const columns = statement.columns().map((column) => column.name)
    const values = rows.map((row) => columns.map((column) => row[column]))
    return (options?.columnNames ? [columns, ...values] : values) as T[]
  }
}

class LocalD1Database {
  readonly #database: DatabaseSync

  constructor() {
    this.#database = new DatabaseSync(join(dataDirectory(), "eraser.sqlite"))
    this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")
    this.#migrate()
  }

  #migrate() {
    const migrationsDirectory = process.env.ERASER_MIGRATIONS_DIR
    if (!migrationsDirectory) throw new Error("ERASER_MIGRATIONS_DIR is missing")
    this.#database.exec(
      "CREATE TABLE IF NOT EXISTS __eraser_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    )
    const applied = this.#database.prepare("SELECT name FROM __eraser_migrations").all() as { name: string }[]
    const known = new Set(applied.map((migration) => migration.name))
    for (const name of readdirSync(migrationsDirectory).filter((file) => file.endsWith(".sql")).sort()) {
      if (known.has(name)) continue
      const source = readFileSync(join(migrationsDirectory, name), "utf8")
      const statements = source
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean)
      this.#database.exec("BEGIN IMMEDIATE")
      try {
        for (const statement of statements) this.#database.exec(statement)
        this.#database.prepare("INSERT INTO __eraser_migrations (name) VALUES (?)").run(name)
        this.#database.exec("COMMIT")
      } catch (error) {
        this.#database.exec("ROLLBACK")
        throw error
      }
    }
  }

  prepare(query: string) {
    return new LocalD1PreparedStatement(this.#database, query)
  }

  async batch(statements: LocalD1PreparedStatement[]) {
    const results: D1Result[] = []
    this.#database.exec("BEGIN")
    try {
      for (const statement of statements) {
        results.push(await statement.run())
      }
      this.#database.exec("COMMIT")
      return results
    } catch (error) {
      this.#database.exec("ROLLBACK")
      throw error
    }
  }

  async exec(query: string) {
    const startedAt = performance.now()
    this.#database.exec(query)
    return { count: 1, duration: performance.now() - startedAt }
  }
}

type R2Metadata = { cacheControl?: string; contentType?: string }

function safeObjectPath(key: string) {
  const base = resolve(dataDirectory(), "objects")
  const target = resolve(base, normalize(key))
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw new Error("INVALID_STORAGE_KEY")
  return target
}

class LocalR2Bucket {
  async put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream, options?: { httpMetadata?: R2Metadata }) {
    const path = safeObjectPath(key)
    mkdirSync(dirname(path), { recursive: true })
    let bytes: Uint8Array
    if (value instanceof ReadableStream) {
      bytes = new Uint8Array(await new Response(value).arrayBuffer())
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value)
    } else {
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    writeFileSync(path, bytes)
    writeFileSync(`${path}.metadata.json`, JSON.stringify(options?.httpMetadata ?? {}), "utf8")
    return null
  }

  async get(key: string) {
    const path = safeObjectPath(key)
    let bytes: Uint8Array
    try {
      bytes = readFileSync(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
    let httpMetadata: R2Metadata = {}
    try {
      httpMetadata = JSON.parse(readFileSync(`${path}.metadata.json`, "utf8")) as R2Metadata
    } catch {
      // Old files without metadata remain readable.
    }
    const stableBytes = Uint8Array.from(bytes)
    return {
      body: new Blob([stableBytes]).stream(),
      httpMetadata,
      arrayBuffer: async () => stableBytes.buffer,
      writeHttpMetadata(headers: Headers) {
        if (httpMetadata.contentType) headers.set("content-type", httpMetadata.contentType)
        if (httpMetadata.cacheControl) headers.set("cache-control", httpMetadata.cacheControl)
      },
    }
  }
}

const dataDir = dataDirectory()
mkdirSync(dataDir, { recursive: true })

export const env = {
  ...process.env,
  ERASER_DESKTOP: "1",
  DB: new LocalD1Database(),
  BUCKET: new LocalR2Bucket(),
}
