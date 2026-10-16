/** Local desktop presentation actions; no Runtime or provider commands. */
export const DESKTOP_IPC = Object.freeze({ copyText: 'desktop:copy-text' })

export interface DesktopClipboardBridge {
  writeText(text: string): Promise<void>
}

export function clipboardText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('invalid_clipboard_text')
  return value
}
