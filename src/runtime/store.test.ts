import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RuntimeKernel } from './kernel'
import { RUNTIME_SCHEMA_VERSION, assertEntityRecord, type Run } from './domain'
import { RuntimeStore } from './store'

const tempDirectories: string[] = []

function createPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'ai-employee-os-runtime-'))
  tempDirectories.push(directory)
  return join(directory, 'control.sqlite3')
}

afterEach(() => {
  while (tempDirectories.length) rmSync(tempDirectories.pop()!, { recursive: true, force: true })
})

describe('RuntimeStore', () => {
  it('migrates idempotently and rebuilds the event cursor after reopen', () => {
    const path = createPath()
    const store = new RuntimeStore(path)
    const kernel = new RuntimeKernel(store)
    const run: Run = { schemaVersion: 1, id: 'run-1', createdAt: '2026-08-31T00:00:00Z', taskId: 'task-1', taskRevisionId: 'revision-1', runGrantId: 'grant-1', state: 'created' }
    expect(kernel.save({ entityType: 'Run', entity: run, immutable: false }, 'run.created', { state: 'created' })).toBe(1)
    expect(kernel.health()).toMatchObject({ state: 'ready', schemaVersion: 2, lastEventSequence: 1, databaseIntegrity: true })
    store.close()

    const reopened = new RuntimeStore(path)
    expect(reopened.schemaVersion).toBe(2)
    expect(reopened.recoverProjection()).toBe(1)
    expect(reopened.eventsAfter(0)).toHaveLength(1)
    expect(reopened.get<Run>('Run', 'run-1')?.state).toBe('created')
    reopened.close()
  })

  it('creates a consistent backup before upgrading an existing schema', () => {
    const path = createPath()
    new RuntimeStore(path).close()
    const legacy = new DatabaseSync(path)
    legacy.exec("DELETE FROM schema_migrations WHERE version=2; DROP TRIGGER audit_events_no_update; DROP TRIGGER audit_events_no_delete; DROP TRIGGER immutable_entity_no_update; DROP TRIGGER immutable_entity_no_delete; CREATE TABLE legacy_marker(value TEXT NOT NULL) STRICT; INSERT INTO legacy_marker VALUES('preserved');")
    legacy.close()
    const upgraded = new RuntimeStore(path)
    expect(upgraded.schemaVersion).toBe(2)
    const backups = readdirSync(join(dirname(path), 'migration-backups'))
    expect(backups).toHaveLength(1)
    const backup = new DatabaseSync(join(dirname(path), 'migration-backups', backups[0]))
    expect(backup.prepare('SELECT value FROM legacy_marker').get()).toEqual({ value: 'preserved' })
    expect(backup.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()).toEqual({ version: 1 })
    backup.close(); upgraded.close()
  })

  it('keeps immutable snapshots and audit events append-only', () => {
    const store = new RuntimeStore(createPath())
    const kernel = new RuntimeKernel(store)
    const entity = { schemaVersion: RUNTIME_SCHEMA_VERSION, id: 'revision-1', createdAt: '2026-08-31T00:00:00Z', taskId: 'task-1', sourceDraftId: 'draft-1', revision: 1, frozen: true as const, goal: 'test', acceptanceCriteria: ['pass'], employeeVersionIds: [], capabilityVersionIds: [], modelConfigIds: [], budget: { maxInputTokens: 1, maxOutputTokens: 1, maxAmountUsdMicros: 1, maxSteps: 1 }, timeoutsMs: { firstToken: 1, request: 1, run: 1 }, authorizationMode: 'approval_required' as const, resourceScope: { directories: [], toolVersionIds: [], modelConfigIds: [], memoryScopes: [] } }
    kernel.save({ entityType: 'TaskRevision', entity, immutable: true }, 'task_revision.frozen', {})
    expect(() => kernel.save({ entityType: 'TaskRevision', entity: { ...entity, goal: 'mutated' }, immutable: true }, 'task_revision.changed', {})).toThrow('immutable_entity_exists')
    expect(() => store.database.exec("UPDATE audit_events SET event_type = 'tampered'")).toThrow('audit_events_are_append_only')
    expect(() => store.database.exec("DELETE FROM entity_records WHERE entity_type = 'TaskRevision'")).toThrow('immutable_entity_cannot_change')
    expect(store.eventsAfter(0)).toHaveLength(1)
    store.close()
  })

  it('rejects unknown schema versions and entity types', () => {
    expect(() => assertEntityRecord({ entityType: 'Unknown', entity: { schemaVersion: 1, id: 'x', createdAt: '2026-08-31T00:00:00Z' }, immutable: false })).toThrow('unknown_entity_type')
    expect(() => assertEntityRecord({ entityType: 'Run', entity: { schemaVersion: 2, id: 'x', createdAt: '2026-08-31T00:00:00Z' }, immutable: false })).toThrow('unsupported_schema_version')
    expect(() => assertEntityRecord({ entityType: 'Run', entity: { schemaVersion: 1, id: 'x', createdAt: '2026-08-31T00:00:00Z', state: 'mystery' }, immutable: false })).toThrow('unknown_run_state')
  })
})
