const RECOVERABLE = new Set(['teams_attendee_not_from_search', 'teams_event_not_from_task', 'invalid_teams_parameters', 'invalid_tool_parameters', 'parameter_source_required', 'invalid_parameter_source', 'invalid_tool_proposal_name', 'invalid_tool_proposal_arguments', 'invalid_tool_proposal_schema', 'tool_not_available_for_assignment', 'invalid_document_create_path', 'invalid_document_create_filename', 'document_draft_required_before_create', 'document_write_or_existing_create_required_before_read', 'document_draft_required_before_edit', 'document_read_required_before_edit'])

/** The existing Runtime correction policy is shared by legacy and SDK execution. */
export function isRecoverableToolProposalError(code: string): boolean { return RECOVERABLE.has(code) }
