import { useEffect, useState } from 'react'
import { createFeishuMeetingSession, tickDemoMeetings, type FeishuMeetingSession } from './feishu-meeting-demo'

// Owned by App so navigation never cancels a meeting or starts a second timer.
export function useFeishuMeetingSessions() {
  const [sessions, setSessions] = useState<Record<string, FeishuMeetingSession>>(() => ({ 'feishu-meeting-v01': createFeishuMeetingSession() }))
  const running = Object.values(sessions).some((session) => session.nextStepAt !== undefined)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSessions((current) => tickDemoMeetings(current)), 250)
    return () => window.clearInterval(timer)
  }, [running])
  return [sessions, setSessions] as const
}
