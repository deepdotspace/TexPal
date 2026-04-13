/**
 * useAutoSave — debounced save indicator.
 *
 * Since useYjsText syncs instantly, this hook only tracks whether
 * content has been recently modified to show "Saving..." / "Saved" status.
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export type SaveStatus = 'saved' | 'saving' | 'idle'

interface UseAutoSaveReturn {
  saveStatus: SaveStatus
  markDirty: () => void
}

export function useAutoSave(delay: number = 1500): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const markDirty = useCallback(() => {
    setSaveStatus('saving')

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      setSaveStatus('saved')
    }, delay)
  }, [delay])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { saveStatus, markDirty }
}
