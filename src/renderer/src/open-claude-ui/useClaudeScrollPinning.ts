/**
 * Adapted from Caho1/open-claude-ui, commit
 * f504349419118a32804ce3a7fae74593070bf945 (MIT).
 * See third_party/open-claude-ui for the original license and provenance.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from 'react'

const BOTTOM_TOLERANCE_PX = 40
const USER_INPUT_PROTECTION_MS = 150
const JUMP_CONTROL_DISTANCE_PX = 120
const SMOOTH_SCROLL_TIMEOUT_MS = 1000

interface SmoothScrollTarget {
  top: number
  previousTop: number
  expiresAt: number
}

function distanceFromBottom(element: HTMLDivElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop)
}

/**
 * Keep a conversation at the latest message until the user reads older content.
 * Pass the conversation identity separately from content dependencies. Bind
 * markUserInput to wheel, touch and scrolling-key input; bind handleScroll to
 * onScroll. Only scrolling keys should call markUserInput from onKeyDown.
 */
export function useClaudeScrollPinning(dependencies: DependencyList, conversationKey?: string | number | null) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPinned, setIsPinned] = useState(true)
  const [showJumpControl, setShowJumpControl] = useState(false)
  const pinnedRef = useRef(true)
  const lastUserInputAt = useRef(Number.NEGATIVE_INFINITY)
  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputOrigin = useRef<{ top: number; wasPinned: boolean; moved: boolean } | null>(null)
  const smoothTarget = useRef<SmoothScrollTarget | null>(null)
  const smoothTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const observedContainer = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const observedChildren = useRef(new Set<Element>())
  const previousKey = useRef(conversationKey)
  const previousDependencies = useRef<DependencyList | null>(null)

  const updatePinned = useCallback((pinned: boolean) => {
    pinnedRef.current = pinned
    setIsPinned(pinned)
  }, [])

  const clearSmoothScroll = useCallback(() => {
    smoothTarget.current = null
    if (smoothTimer.current !== null) clearTimeout(smoothTimer.current)
    smoothTimer.current = null
  }, [])

  const clearUserInput = useCallback(() => {
    if (inputTimer.current !== null) clearTimeout(inputTimer.current)
    inputTimer.current = null
    inputOrigin.current = null
    lastUserInputAt.current = Number.NEGATIVE_INFINITY
  }, [])

  const measurePosition = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    const distance = distanceFromBottom(element)
    updatePinned(distance <= BOTTOM_TOLERANCE_PX)
    setShowJumpControl(distance > JUMP_CONTROL_DISTANCE_PX)
  }, [updatePinned])

  const scrollToBottom = useCallback((smooth = false) => {
    const element = containerRef.current
    if (!element) return
    clearUserInput()
    clearSmoothScroll()
    const top = Math.max(0, element.scrollHeight - element.clientHeight)
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const animate = smooth && !reducedMotion && Math.abs(element.scrollTop - top) > 1
    updatePinned(true)
    setShowJumpControl(false)
    if (Math.abs(element.scrollTop - top) <= 1) return
    if (animate) {
      smoothTarget.current = { top, previousTop: element.scrollTop, expiresAt: performance.now() + SMOOTH_SCROLL_TIMEOUT_MS }
      // A browser may omit scrollend, including when scrolling is interrupted.
      smoothTimer.current = setTimeout(() => {
        clearSmoothScroll()
        measurePosition()
      }, SMOOTH_SCROLL_TIMEOUT_MS)
    }
    element.scrollTo({ top, behavior: animate ? 'smooth' : 'auto' })
  }, [clearSmoothScroll, clearUserInput, measurePosition, updatePinned])

  const reconcile = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    if (performance.now() - lastUserInputAt.current < USER_INPUT_PROTECTION_MS) {
      setShowJumpControl(distanceFromBottom(element) > JUMP_CONTROL_DISTANCE_PX)
      return
    }
    if (pinnedRef.current || distanceFromBottom(element) <= BOTTOM_TOLERANCE_PX) scrollToBottom()
    else measurePosition()
  }, [measurePosition, scrollToBottom])

  const markUserInput = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    if (!inputOrigin.current) inputOrigin.current = { top: element.scrollTop, wasPinned: pinnedRef.current, moved: false }
    lastUserInputAt.current = performance.now()
    if (inputTimer.current !== null) clearTimeout(inputTimer.current)
    if (smoothTarget.current) {
      clearSmoothScroll()
      // Cancel an in-flight native smooth scroll before yielding to the user.
      element.scrollTo({ top: element.scrollTop, behavior: 'auto' })
    }
    updatePinned(false)
    setShowJumpControl(distanceFromBottom(element) > JUMP_CONTROL_DISTANCE_PX)
    inputTimer.current = setTimeout(() => {
      const current = containerRef.current
      const origin = inputOrigin.current
      const resumeFollowing = current && origin?.wasPinned && !origin.moved && Math.abs(current.scrollTop - origin.top) <= 1
      clearUserInput()
      if (!current) return
      if (resumeFollowing || distanceFromBottom(current) <= BOTTOM_TOLERANCE_PX) scrollToBottom()
      else measurePosition()
    }, USER_INPUT_PROTECTION_MS)
  }, [clearSmoothScroll, clearUserInput, measurePosition, scrollToBottom, updatePinned])

  const handleScroll = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    if (inputOrigin.current && Math.abs(element.scrollTop - inputOrigin.current.top) > 1) inputOrigin.current.moved = true
    if (performance.now() - lastUserInputAt.current < USER_INPUT_PROTECTION_MS) {
      setShowJumpControl(distanceFromBottom(element) > JUMP_CONTROL_DISTANCE_PX)
      return
    }
    const target = smoothTarget.current
    if (target) {
      const movedAway = Math.abs(element.scrollTop - target.top) > Math.abs(target.previousTop - target.top) + 1
      if (!movedAway && Math.abs(element.scrollTop - target.top) > 1 && performance.now() < target.expiresAt) {
        target.previousTop = element.scrollTop
        return
      }
      clearSmoothScroll()
    }
    // Instant alignment never installs a flag that could consume a later event.
    measurePosition()
  }, [clearSmoothScroll, measurePosition])

  const handleScrollEnd = useCallback(() => {
    if (!smoothTarget.current) return
    clearSmoothScroll()
    measurePosition()
  }, [clearSmoothScroll, measurePosition])

  // Refs may attach or be replaced without a content dependency changing.
  // Synchronize observation after each commit, measuring only changed inputs.
  useLayoutEffect(() => {
    const element = containerRef.current
    const containerChanged = element !== observedContainer.current
    const conversationChanged = !Object.is(previousKey.current, conversationKey)
    const contentChanged = previousDependencies.current === null || dependencies.length !== previousDependencies.current.length || dependencies.some((value, index) => !Object.is(value, previousDependencies.current?.[index]))
    previousKey.current = conversationKey
    previousDependencies.current = [...dependencies]
    if (conversationChanged || containerChanged) {
      clearUserInput()
      clearSmoothScroll()
      updatePinned(true)
      setShowJumpControl(false)
    }
    if (containerChanged) {
      observedContainer.current?.removeEventListener('scrollend', handleScrollEnd)
      observerRef.current?.disconnect()
      observerRef.current = null
      observedChildren.current.clear()
      observedContainer.current = element
      if (element) {
        element.addEventListener('scrollend', handleScrollEnd)
        if (typeof ResizeObserver !== 'undefined') {
          observerRef.current = new ResizeObserver(reconcile)
          observerRef.current.observe(element)
        }
      }
    }
    const observer = observerRef.current
    if (element && observer) {
      const children = new Set(element.children)
      for (const child of observedChildren.current) if (!children.has(child)) observer.unobserve(child)
      for (const child of children) if (!observedChildren.current.has(child)) observer.observe(child)
      observedChildren.current = children
    }
    if (containerChanged || conversationChanged || contentChanged) reconcile()
  })

  useEffect(() => () => {
    clearUserInput()
    clearSmoothScroll()
    observedContainer.current?.removeEventListener('scrollend', handleScrollEnd)
    observedContainer.current = null
    observerRef.current?.disconnect()
    observerRef.current = null
    observedChildren.current.clear()
  }, [clearSmoothScroll, clearUserInput, handleScrollEnd])

  return { containerRef, isPinned, showJumpControl, markUserInput, handleScroll, scrollToBottom }
}
