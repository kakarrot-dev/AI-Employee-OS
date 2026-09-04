import { describe, expect, it } from 'vitest'
import { createHandoffEnvelope, normalizeHandoffJsonValue, renderHandoffEnvelope, verifyHandoffEnvelope } from './handoff-contract'

function envelope(parts: Parameters<typeof createHandoffEnvelope>[0]['parts']) {
  return createHandoffEnvelope({
    runId: 'run-1',
    taskRevisionId: 'revision-1',
    producer: { assignmentId: 'assignment-1', employeeVersionId: 'employee-version-1' },
    audience: { assignmentIds: ['assignment-2'], supervisor: true },
    summary: '标准交接',
    parts
  })
}

describe('AgentHandoffEnvelope', () => {
  it('carries every supported result shape through one versioned envelope', () => {
    const created = envelope([
      { kind: 'text', mediaType: 'text/markdown', text: '# 结论' },
      { kind: 'data', mediaType: 'application/json', schemaId: 'example/Result/v1', value: { rows: [{ id: 1, ok: true }] } },
      { kind: 'artifact_ref', artifactId: 'artifact-1', mediaType: 'application/pdf', sha256: 'a'.repeat(64) },
      { kind: 'evidence_ref', evidenceId: 'evidence-1', sha256: 'b'.repeat(64) },
      { kind: 'error', code: 'partial_source_failure', message: '一个来源不可用', retryable: true, details: { source: 'example' } },
      { kind: 'extension', namespace: 'com.example/vector', mediaType: 'application/vnd.example.vector+json', value: { dimensions: 3, values: [1, 2, 3] } }
    ])

    const rendered = renderHandoffEnvelope(created.envelope, created.sha256, { assignmentId: 'assignment-2' })
    expect(JSON.parse(rendered)).toMatchObject({ type: 'AgentHandoffEnvelope', schemaVersion: 1, parts: [{ kind: 'text' }, { kind: 'data' }, { kind: 'artifact_ref' }, { kind: 'evidence_ref' }, { kind: 'error' }, { kind: 'extension' }] })
    expect(() => renderHandoffEnvelope(created.envelope, created.sha256, { assignmentId: 'assignment-3' })).toThrow('handoff_recipient_not_authorized')
  })

  it('hashes canonical JSON deterministically and rejects tampering', () => {
    const first = envelope([{ kind: 'data', mediaType: 'application/json', value: { b: 2, a: 1 } }])
    const second = envelope([{ kind: 'data', mediaType: 'application/json', value: { a: 1, b: 2 } }])
    expect(first.sha256).toBe(second.sha256)
    const tampered = { ...first.envelope, parts: [{ kind: 'text' as const, mediaType: 'text/plain' as const, text: '已篡改' }] }
    expect(() => verifyHandoffEnvelope(tampered, first.sha256)).toThrow('handoff_integrity_failed')
  })

  it('normalizes ordinary objects but rejects values that cannot cross a process boundary', () => {
    expect(normalizeHandoffJsonValue({ value: 1, omitted: undefined })).toEqual({ value: 1 })
    expect(() => normalizeHandoffJsonValue({ value: BigInt(1) })).toThrow('handoff_non_json_value')
    expect(() => envelope([{ kind: 'text', mediaType: 'text/plain', text: 'x'.repeat(513 * 1024) }])).toThrow('handoff_payload_too_large')
  })
})
