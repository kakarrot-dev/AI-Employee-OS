import { randomUUID } from 'node:crypto'
import { RUNTIME_SCHEMA_VERSION, type EntityRecord } from './domain'
import { RuntimeStore } from './store'

export interface RuntimeHealth {
  state: 'ready' | 'degraded'
  schemaVersion: number
  lastEventSequence: number
  databaseIntegrity: boolean
  checkedAt: string
}

export class RuntimeKernel {
  constructor(readonly store: RuntimeStore) {}

  health(): RuntimeHealth {
    const databaseIntegrity = this.store.quickCheck()
    return {
      state: databaseIntegrity ? 'ready' : 'degraded',
      schemaVersion: this.store.schemaVersion,
      lastEventSequence: this.store.lastEventSequence,
      databaseIntegrity,
      checkedAt: new Date().toISOString()
    }
  }

  save(record: EntityRecord, eventType: string, payload: unknown): number {
    return this.store.save(record, {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      eventType,
      aggregateType: record.entityType,
      aggregateId: record.entity.id,
      payload
    })
  }

  deleteMutable(entityType: EntityRecord['entityType'], entityId: string, eventType: string, payload: unknown): number {
    return this.store.deleteMutable(entityType, entityId, {
      schemaVersion: RUNTIME_SCHEMA_VERSION,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      eventType,
      aggregateType: entityType,
      aggregateId: entityId,
      payload
    })
  }

  recover(): RuntimeHealth {
    this.store.recoverProjection()
    return this.health()
  }
}
