import { dirname } from 'node:path'
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { CloudAdapter, ConfigurationBotFrameworkAuthentication, TeamsActivityHandler, TurnContext, type ConversationReference, type AdaptiveCardInvokeValue, type AdaptiveCardInvokeResponse } from 'botbuilder'
import { TeamsCardLedger, type CardMeetingInput } from './teams-card-ledger'
import type { TeamsConnectionInput, TeamsMeetingConfirmation } from '../shared/teams-contract'

type Target = { tenantId: string; reference: Partial<ConversationReference> }
class ConfirmationBot extends TeamsActivityHandler {
  constructor(private readonly service: TeamsCardService) {
    super()
    this.onConversationUpdate(async (context, next) => { this.service.register(context); await next() })
    this.onMessage(async (context, next) => { this.service.register(context); await next() })
  }
  protected override async onAdaptiveCardInvoke(context: TurnContext, value: AdaptiveCardInvokeValue): Promise<AdaptiveCardInvokeResponse> {
    try {
      const card = this.service.respond(context, value)
      return { statusCode: 200, type: 'application/vnd.microsoft.card.adaptive', value: card }
    } catch { return { statusCode: 403, type: 'application/vnd.microsoft.error', value: { code: 'InvalidResponse', message: '此卡片已处理、已过期或不属于当前用户。' } } }
  }
}

/** OAuth verification is performed by CloudAdapter before any identity or callback is used. */
export class TeamsCardService {
  private server?: Server
  private adapter?: CloudAdapter
  private credentials?: TeamsConnectionInput
  private targets: Record<string, Target> = {}
  private readonly sending = new Set<string>()
  readonly ledger: TeamsCardLedger
  constructor(private readonly statePath: string, private readonly onChange: (snapshot: TeamsMeetingConfirmation) => void) {
    mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 })
    this.ledger = new TeamsCardLedger(`${statePath}.meetings.json`)
    if (existsSync(`${statePath}.targets.json`)) this.targets = JSON.parse(readFileSync(`${statePath}.targets.json`, 'utf8'))
  }
  async start(credentials: TeamsConnectionInput): Promise<void> {
    if (this.server && this.credentials?.clientId === credentials.clientId && this.credentials.tenantId === credentials.tenantId && this.credentials.clientSecret === credentials.clientSecret) return
    await this.stop()
    this.credentials = credentials
    const adapter = new CloudAdapter(new ConfigurationBotFrameworkAuthentication({ MicrosoftAppId: credentials.clientId, MicrosoftAppPassword: credentials.clientSecret, MicrosoftAppType: 'SingleTenant', MicrosoftAppTenantId: credentials.tenantId }))
    this.adapter = adapter
    const bot = new ConfirmationBot(this)
    adapter.onTurnError = async () => { /* SDK errors never expose activity bodies or tokens to client logs. */ }
    const server = createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/api/messages') { response.writeHead(404); response.end(); return }
      try {
        const chunks: Buffer[] = []; let size = 0
        for await (const chunk of request) { size += chunk.length; if (size > 256 * 1024) throw new Error('payload_too_large'); chunks.push(chunk) }
        const incoming = request as typeof request & { body: Record<string, unknown> }; incoming.body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        // CloudAdapter requires the Express-compatible response surface.
        const outgoing = Object.assign(response, {
          status(code: number) { response.statusCode = code; return outgoing },
          header(name: string, value: string) { response.setHeader(name, value); return outgoing },
          send(body: unknown) { if (body !== undefined) response.write(typeof body === 'string' ? body : JSON.stringify(body)); return outgoing }
        })
        await adapter.process(incoming, outgoing, context => bot.run(context))
      } catch { if (!response.headersSent) response.writeHead(401); if (!response.writableEnded) response.end() }
    })
    server.requestTimeout = 15000
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(3978, '127.0.0.1', () => { server.removeListener('error', reject); resolve() }) })
    this.server = server
  }
  async stop(): Promise<void> {
    const server = this.server; this.server = undefined; this.adapter = undefined; this.credentials = undefined
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  }
  register(context: TurnContext): void {
    const activity = context.activity
    if (activity.channelId !== 'msteams' || activity.conversation?.conversationType !== 'personal' || activity.channelData?.tenant?.id !== this.credentials?.tenantId || !activity.from?.aadObjectId) return
    const reference = TurnContext.getConversationReference(activity)
    if (!reference.conversation?.id || !reference.serviceUrl?.startsWith('https://')) return
    this.targets[activity.from.aadObjectId] = { tenantId: this.credentials!.tenantId, reference }
    writeFileSync(`${this.statePath}.targets.json.tmp`, JSON.stringify(this.targets), { mode: 0o600 }); renameSync(`${this.statePath}.targets.json.tmp`, `${this.statePath}.targets.json`)
  }
  respond(context: TurnContext, value: AdaptiveCardInvokeValue): Record<string, unknown> {
    const activity = context.activity, data = value.action?.data
    if (activity.channelId !== 'msteams' || activity.conversation?.conversationType !== 'personal' || value.action?.verb !== 'meeting_response' || !activity.from?.aadObjectId || !data || typeof data.eventId !== 'string' || typeof data.nonce !== 'string' || typeof data.decision !== 'string' || activity.channelData?.tenant?.id !== this.credentials?.tenantId) throw new Error('teams_card_invalid_callback')
    const snapshot = this.ledger.acknowledge({ eventId: data.eventId, nonce: data.nonce, decision: data.decision, tenantId: activity.channelData.tenant.id, userId: activity.from.aadObjectId, conversationId: activity.conversation.id })
    this.onChange(snapshot)
    return this.ledger.card(data.eventId, activity.from.aadObjectId)
  }
  async send(input: CardMeetingInput): Promise<TeamsMeetingConfirmation> {
    this.ledger.prepare(input)
    if (this.sending.has(input.calendarEventId)) return this.ledger.snapshot(input.calendarEventId)!
    this.sending.add(input.calendarEventId)
    try {
      for (const person of this.ledger.unsent(input.calendarEventId)) {
        const target = this.targets[person.userId], adapter = this.adapter, credentials = this.credentials
        if (!this.server || !adapter || !credentials || target?.tenantId !== input.tenantId || !target.reference.conversation?.id) continue
        this.ledger.beginSend(input.calendarEventId, person.userId, target.reference.conversation.id)
        this.onChange(this.ledger.snapshot(input.calendarEventId)!)
        let messageId: string | undefined
        try {
          let timer: ReturnType<typeof setTimeout> | undefined
          try { await Promise.race([adapter.continueConversationAsync(credentials.clientId, target.reference, async context => {
            const receipt = await context.sendActivity({ type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: this.ledger.card(input.calendarEventId, person.userId) }] })
            messageId = receipt?.id
          }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('teams_card_send_timeout')), 15000) })]) } finally { if (timer) clearTimeout(timer) }
        } catch { /* A timeout can follow a successful send. Never resend without a receipt. */ }
        this.ledger.finishSend(input.calendarEventId, person.userId, messageId)
        this.onChange(this.ledger.snapshot(input.calendarEventId)!)
      }
    } finally { this.sending.delete(input.calendarEventId) }
    const snapshot = this.ledger.snapshot(input.calendarEventId)!
    this.onChange(snapshot)
    return snapshot
  }
}
