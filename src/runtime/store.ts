import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { assertEntityRecord, type AuditEvent, type EntityRecord, type RuntimeEntity } from './domain'

export interface StoredAuditEvent extends AuditEvent {
  sequence: number
}

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS entity_records (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        immutable INTEGER NOT NULL CHECK (immutable IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (entity_type, entity_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL,
        occurred_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS runtime_projection (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        last_event_sequence INTEGER NOT NULL
      ) STRICT;
      INSERT OR IGNORE INTO runtime_projection(singleton_id, last_event_sequence) VALUES (1, 0);
    `
  },
  {
    version: 2,
    sql: `
      CREATE TRIGGER IF NOT EXISTS audit_events_no_update
      BEFORE UPDATE ON audit_events BEGIN
        SELECT RAISE(ABORT, 'audit_events_are_append_only');
      END;
      CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
      BEFORE DELETE ON audit_events BEGIN
        SELECT RAISE(ABORT, 'audit_events_are_append_only');
      END;
      CREATE TRIGGER IF NOT EXISTS immutable_entity_no_update
      BEFORE UPDATE ON entity_records WHEN OLD.immutable = 1 BEGIN
        SELECT RAISE(ABORT, 'immutable_entity_cannot_change');
      END;
      CREATE TRIGGER IF NOT EXISTS immutable_entity_no_delete
      BEFORE DELETE ON entity_records WHEN OLD.immutable = 1 BEGIN
        SELECT RAISE(ABORT, 'immutable_entity_cannot_change');
      END;
    `
  }
] as const

export class RuntimeStore {
  readonly database: DatabaseSync
  private readonly databasePath: string

  constructor(databasePath: string) {
    this.databasePath = databasePath
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
    this.database = new DatabaseSync(databasePath)
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;')
    this.migrate()
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `)
    const currentVersion = Number((this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }).version)
    if (currentVersion > 0 && currentVersion < MIGRATIONS.at(-1)!.version) this.backupBeforeMigration(currentVersion)
    const hasMigration = this.database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
    const addMigration = this.database.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
    for (const migration of MIGRATIONS) {
      if (hasMigration.get(migration.version)) continue
      this.database.exec('BEGIN IMMEDIATE')
      try {
        this.database.exec(migration.sql)
        addMigration.run(migration.version, new Date().toISOString())
        this.database.exec('COMMIT')
      } catch (error) {
        this.database.exec('ROLLBACK')
        throw error
      }
    }
  }

  private backupBeforeMigration(currentVersion: number): void {
    if (this.databasePath === ':memory:') return
    const root = join(dirname(this.databasePath), 'migration-backups')
    mkdirSync(root, { recursive: true, mode: 0o700 })
    const destination = join(root, `${basename(this.databasePath)}.v${currentVersion}.${new Date().toISOString().replaceAll(':', '-')}.sqlite3`)
    if (existsSync(destination)) throw new Error('migration_backup_collision')
    this.database.exec('PRAGMA wal_checkpoint(FULL)')
    this.database.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`)
    const backups = readdirSync(root).filter((name) => name.startsWith(`${basename(this.databasePath)}.v`) && name.endsWith('.sqlite3')).sort().reverse()
    for (const stale of backups.slice(3)) rmSync(join(root, stale))
  }

  get schemaVersion(): number {
    const row = this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as { version: number }
    return row.version
  }

  save(record: EntityRecord, event: AuditEvent): number {
    assertEntityRecord(record)
    const now = new Date().toISOString()
    const existing = this.database.prepare('SELECT immutable FROM entity_records WHERE entity_type = ? AND entity_id = ?').get(record.entityType, record.entity.id) as { immutable: number } | undefined
    if (existing?.immutable) throw new Error('immutable_entity_exists')

    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare(`
        INSERT INTO entity_records(entity_type, entity_id, schema_version, payload_json, immutable, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(entity_type, entity_id) DO UPDATE SET
          schema_version = excluded.schema_version,
          payload_json = excluded.payload_json,
          immutable = excluded.immutable,
          updated_at = excluded.updated_at
      `).run(record.entityType, record.entity.id, record.entity.schemaVersion, JSON.stringify(record.entity), record.immutable ? 1 : 0, record.entity.createdAt, now)
      const result = this.database.prepare(`
        INSERT INTO audit_events(event_id, schema_version, occurred_at, event_type, aggregate_type, aggregate_id, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(event.eventId, event.schemaVersion, event.occurredAt, event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload))
      const sequence = Number(result.lastInsertRowid)
      this.database.prepare('UPDATE runtime_projection SET last_event_sequence = ? WHERE singleton_id = 1').run(sequence)
      this.database.exec('COMMIT')
      return sequence
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  deleteMutable(entityType: EntityRecord['entityType'], entityId: string, event: AuditEvent): number {
    const existing = this.database.prepare('SELECT immutable FROM entity_records WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId) as { immutable: number } | undefined
    if (!existing) throw new Error('entity_not_found')
    if (existing.immutable) throw new Error('immutable_entity_cannot_change')

    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('DELETE FROM entity_records WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId)
      const result = this.database.prepare(`
        INSERT INTO audit_events(event_id, schema_version, occurred_at, event_type, aggregate_type, aggregate_id, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(event.eventId, event.schemaVersion, event.occurredAt, event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload))
      const sequence = Number(result.lastInsertRowid)
      this.database.prepare('UPDATE runtime_projection SET last_event_sequence = ? WHERE singleton_id = 1').run(sequence)
      this.database.exec('COMMIT')
      return sequence
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  get<T extends RuntimeEntity>(entityType: EntityRecord['entityType'], entityId: string): T | undefined {
    const row = this.database.prepare('SELECT payload_json FROM entity_records WHERE entity_type = ? AND entity_id = ?').get(entityType, entityId) as { payload_json: string } | undefined
    return row ? JSON.parse(row.payload_json) as T : undefined
  }

  list<T extends RuntimeEntity>(entityType: EntityRecord['entityType']): T[] {
    const rows = this.database.prepare('SELECT payload_json FROM entity_records WHERE entity_type = ? ORDER BY created_at ASC, entity_id ASC').all(entityType) as Array<{ payload_json: string }>
    return rows.map((row) => JSON.parse(row.payload_json) as T)
  }

  eventsAfter(sequence: number, limit = 100): StoredAuditEvent[] {
    const rows = this.database.prepare(`
      SELECT sequence, event_id, schema_version, occurred_at, event_type, aggregate_type, aggregate_id, payload_json
      FROM audit_events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?
    `).all(sequence, limit) as Array<Record<string, string | number>>
    return rows.map((row) => ({
      sequence: Number(row.sequence),
      eventId: String(row.event_id),
      schemaVersion: 1,
      occurredAt: String(row.occurred_at),
      eventType: String(row.event_type),
      aggregateType: String(row.aggregate_type) as StoredAuditEvent['aggregateType'],
      aggregateId: String(row.aggregate_id),
      payload: JSON.parse(String(row.payload_json))
    }))
  }

  get lastEventSequence(): number {
    const row = this.database.prepare('SELECT last_event_sequence FROM runtime_projection WHERE singleton_id = 1').get() as { last_event_sequence: number }
    return row.last_event_sequence
  }

  recoverProjection(): number {
    const row = this.database.prepare('SELECT COALESCE(MAX(sequence), 0) AS sequence FROM audit_events').get() as { sequence: number }
    this.database.prepare('UPDATE runtime_projection SET last_event_sequence = ? WHERE singleton_id = 1').run(row.sequence)
    return row.sequence
  }

  quickCheck(): boolean {
    const row = this.database.prepare('PRAGMA quick_check').get() as { quick_check: string }
    return row.quick_check === 'ok'
  }

  close(): void {
    this.database.close()
  }
}
