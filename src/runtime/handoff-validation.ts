import { createHash } from 'node:crypto'
import type { Run, RunGrant } from './domain'
import { assertHandoffAudience, canonicalHandoffJson, normalizeHandoffJsonValue, verifyHandoffEnvelope } from './handoff-contract'
import type { FormalTaskDetail } from './task-service'

export function usesSdkHandoffValidation(run: Run | undefined): boolean {
  return run?.employeeExecutor === 'openai-agents-ts-v1' || run?.employeeExecutor === 'openai-agents-ts-v2'
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalHandoffJson(normalizeHandoffJsonValue(value))).digest('hex')
}

/** Validates saved Runtime facts only. This neither runs an agent nor authorizes a tool. */
export function validateRuntimeHandoffs(detail: FormalTaskDetail, grant: RunGrant | undefined) {
  const { run, revision, task, assignments, handoffs } = detail
  if (run?.employeeExecutor && !usesSdkHandoffValidation(run)) throw new Error('handoff_executor_unsupported')
  if (!run || !revision || run.taskRevisionId !== revision.id || run.taskId !== revision.taskId || task?.activeRunId !== run.id) throw new Error('handoff_binding_failed')
  // The task projection also includes prior Teams receipts for retry safety; their
  // ancestry and business evidence remain governed by the existing Teams policy.
  const toolActions = detail.toolActions.filter((action) => action.runId === run.id)
  if (!grant || grant.id !== run.runGrantId || grant.runId !== run.id) throw new Error('run_grant_not_found')
  if (digest(grant.resourceScope) !== digest(revision.resourceScope) || grant.authorizationMode !== revision.authorizationMode) throw new Error('handoff_grant_mismatch')
  if (!assignments.length || assignments.some((a) => a.state !== 'succeeded')) throw new Error('handoff_assignment_incomplete')
  // SDK validation retains its existing contract. Legacy document completion may
  // have cleared the final model turn while retaining its verified file draft.
  const final = assignments.at(-1)!
  if (!final.output && (usesSdkHandoffValidation(run) || !final.draftContent)) throw new Error('invalid_worker_payload')
  const originals = assignments.filter((a) => !a.reworkOfAssignmentId)
  if (originals.length !== revision.employeeVersionIds.length || originals.some((a, index) => a.employeeVersionId !== revision.employeeVersionIds[index])) throw new Error('handoff_employee_not_authorized')
  const byId = new Map(assignments.map((a) => [a.id, a]))
  for (const [index, assignment] of assignments.entries()) {
    const original = assignment.reworkOfAssignmentId ? byId.get(assignment.reworkOfAssignmentId) : assignment
    if (assignment.runId !== run.id || assignment.sequence !== index + 1 || !original || original.reworkOfAssignmentId || original.sequence > assignment.sequence || original.employeeVersionId !== assignment.employeeVersionId) throw new Error('handoff_binding_failed')
    if (handoffs.filter((h) => h.fromAssignmentId === assignment.id).length !== 1) throw new Error('handoff_missing')
    if ((assignment.toolActionIds ?? []).some((id) => !toolActions.some((action) => action.id === id && action.assignmentId === assignment.id))) throw new Error('handoff_tool_action_missing')
  }
  for (const action of toolActions) {
    if (['pending', 'running', 'result_unknown'].includes(action.state)) throw new Error('handoff_unsettled_tool_action')
    if (action.runId !== run.id || !byId.get(action.assignmentId)?.toolActionIds?.includes(action.id)) throw new Error('handoff_binding_failed')
    if (!grant.resourceScope.toolVersionIds.includes(action.toolVersionId)) throw new Error('tool_outside_run_grant')
    if (action.state === 'succeeded' && action.resultVerified !== true) throw new Error('handoff_tool_result_unverified')
  }
  for (const handoff of handoffs) {
    const assignment = byId.get(handoff.fromAssignmentId), envelope = handoff.envelope
    if (!assignment || handoff.runId !== run.id) throw new Error('handoff_binding_failed')
    if (handoff.toAssignmentId) {
      if (byId.get(handoff.toAssignmentId)?.sequence !== assignment.sequence + 1 || handoff.toSupervisor) throw new Error('handoff_recipient_not_authorized')
    } else if (!handoff.toSupervisor) throw new Error('handoff_recipient_not_authorized')
    if (envelope) {
      verifyHandoffEnvelope(envelope, handoff.sha256)
      if (envelope.runId !== run.id || envelope.taskRevisionId !== revision.id || envelope.producer.assignmentId !== assignment.id || envelope.producer.employeeVersionId !== assignment.employeeVersionId) throw new Error('handoff_binding_failed')
      assertHandoffAudience(envelope, { supervisor: true })
      if (envelope.audience.assignmentIds.some((id) => !byId.has(id) || byId.get(id)!.sequence <= assignment.sequence)) throw new Error('handoff_recipient_not_authorized')
      if (handoff.toAssignmentId) assertHandoffAudience(envelope, { assignmentId: handoff.toAssignmentId })
    } else {
      if (usesSdkHandoffValidation(run)) throw new Error('handoff_envelope_required')
      // Historical text records remain immutable; this is the existing read rule.
      if (createHash('sha256').update(String(handoff.output?.text ?? '')).digest('hex') !== handoff.sha256) throw new Error('handoff_integrity_failed')
    }
    const parts = envelope?.parts ?? [...handoff.artifactIds.map((artifactId) => ({ kind: 'artifact_ref' as const, artifactId })), ...handoff.evidenceIds.map((evidenceId) => ({ kind: 'evidence_ref' as const, evidenceId }))]
    const artifactIds: string[] = [], evidenceIds: string[] = []
    for (const part of parts) {
      if (part.kind === 'artifact_ref') {
        const artifact = detail.artifacts.find((item) => item.id === part.artifactId && item.runId === run.id)
        if (!artifact) throw new Error('handoff_artifact_not_found')
        if ('sha256' in part && part.sha256 && part.sha256 !== artifact.sha256) throw new Error('handoff_artifact_integrity_failed')
        artifactIds.push(artifact.id)
      }
      if (part.kind === 'evidence_ref') {
        const evidence = detail.evidence.find((item) => item.id === part.evidenceId && item.runId === run.id)
        if (!evidence) throw new Error('handoff_evidence_not_found')
        if ('sha256' in part && part.sha256 && part.sha256 !== evidence.sha256) throw new Error('handoff_evidence_integrity_failed')
        evidenceIds.push(evidence.id)
      }
    }
    if (digest([...new Set(artifactIds)].sort()) !== digest([...handoff.artifactIds].sort()) || digest([...new Set(evidenceIds)].sort()) !== digest([...handoff.evidenceIds].sort())) throw new Error('handoff_reference_mismatch')
  }
  if (!handoffs.some((h) => h.fromAssignmentId === assignments.at(-1)!.id && h.toSupervisor)) throw new Error('handoff_missing')
  const validation = {
    schemaVersion: 1, validator: 'runtime-handoff-v1', executor: run.employeeExecutor ?? 'legacy-runtime',
    runId: run.id, taskRevisionId: revision.id, runGrantId: grant.id,
    bindingSha256: digest({ revision, grant }), allowedToolVersionIds: [...grant.resourceScope.toolVersionIds].sort(),
    assignments: assignments.map((a) => ({ id: a.id, employeeVersionId: a.employeeVersionId, sequence: a.sequence, reworkOfAssignmentId: a.reworkOfAssignmentId, outputSha256: createHash('sha256').update(a.output ?? '').digest('hex') })),
    handoffs: handoffs.map((h) => ({ id: h.id, assignmentId: h.fromAssignmentId, sha256: h.sha256 })),
    toolActions: toolActions.map((action) => ({ id: action.id, sha256: digest(action) }))
  }
  return { ...validation, sha256: digest(validation) }
}
