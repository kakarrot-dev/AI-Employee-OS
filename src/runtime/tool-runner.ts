import type { ToolRunner } from './tool-gateway'
import { externalIntelligenceRunner } from './external-intelligence-runner'
import { localDocumentRunner } from './local-document-runner'
import { managedResearchRunner } from './managed-research-runner'

export const toolRunner: ToolRunner = async (tool, parameters, context) => {
  if (tool.id.startsWith('github.') || tool.id.startsWith('rss.')) return managedResearchRunner(tool, parameters, context)
  if (tool.id.startsWith('agent-reach.') || tool.id.startsWith('last30days.') || tool.id.startsWith('opencli.')) return externalIntelligenceRunner(tool, parameters, context)
  if (tool.id.startsWith('document.')) return localDocumentRunner(tool, parameters, context)
  throw new Error('unsupported_tool_runner')
}
