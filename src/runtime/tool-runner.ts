import type { ToolRunner } from './tool-gateway'
import { externalIntelligenceRunner } from './external-intelligence-runner'
import { localDocumentRunner } from './local-document-runner'
import { managedResearchRunner } from './managed-research-runner'
import { createTenderDocumentRunner, nativeImageTextRecognizer } from './tender-document-runner'

export function createToolRunner(imageTextExtractorPath: string, feishuRunner?: ToolRunner): ToolRunner {
  const tenderDocumentRunner = createTenderDocumentRunner(nativeImageTextRecognizer(imageTextExtractorPath))
  return async (tool, parameters, context) => {
    if (tool.id.startsWith('github.') || tool.id.startsWith('rss.')) return managedResearchRunner(tool, parameters, context)
    if (tool.id.startsWith('agent-reach.') || tool.id.startsWith('last30days.') || tool.id.startsWith('opencli.')) return externalIntelligenceRunner(tool, parameters, context)
    if (tool.id.startsWith('document.')) return localDocumentRunner(tool, parameters, context)
    if (tool.id.startsWith('tender.')) return tenderDocumentRunner(tool, parameters, context)
    if (tool.id.startsWith('feishu.')) {
      if (!feishuRunner) throw new Error('feishu_runner_unavailable')
      return feishuRunner(tool, parameters, context)
    }
    throw new Error('unsupported_tool_runner')
  }
}
