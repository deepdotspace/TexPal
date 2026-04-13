/**
 * useEditorSettings — per-user editor preferences persisted to the
 * editorSettings collection.
 *
 * Reads own record on mount; creates one with defaults if none exist.
 * Returns current settings + an updater that does optimistic local
 * update + async put() to the collection.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
// @ts-ignore — useUser returns { user } in the new SDK
import { DEFAULT_EDITOR_SETTINGS } from '../constants'
import type { CloudCompiler, BibEngine } from '../constants'

export interface EditorSettings {
  fontSize: number
  theme: 'light' | 'dark'
  lineWrapping: boolean
  lineNumbers: boolean
  compiler: CloudCompiler
  bibEngine: BibEngine
}

function normalizeSettings(data?: Partial<EditorSettings>): EditorSettings {
  return {
    fontSize: data?.fontSize ?? DEFAULT_EDITOR_SETTINGS.fontSize,
    theme: data?.theme ?? DEFAULT_EDITOR_SETTINGS.theme,
    lineWrapping: data?.lineWrapping ?? DEFAULT_EDITOR_SETTINGS.lineWrapping,
    lineNumbers: data?.lineNumbers ?? DEFAULT_EDITOR_SETTINGS.lineNumbers,
    compiler: data?.compiler ?? DEFAULT_EDITOR_SETTINGS.compiler,
    bibEngine: data?.bibEngine ?? DEFAULT_EDITOR_SETTINGS.bibEngine,
  }
}

function areSettingsEqual(a: EditorSettings, b: EditorSettings): boolean {
  return (
    a.fontSize === b.fontSize &&
    a.theme === b.theme &&
    a.lineWrapping === b.lineWrapping &&
    a.lineNumbers === b.lineNumbers &&
    a.compiler === b.compiler &&
    a.bibEngine === b.bibEngine
  )
}

export function useEditorSettings() {
  const { user } = useUser()
  const { records, status, error } = useQuery('editorSettings')
  const { create, put } = useMutations('editorSettings')

  const [localSettings, setLocalSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS as EditorSettings)
  const recordIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const createInFlightRef = useRef(false)

  const ownRecord = useMemo(() => {
    if (!user || status !== 'ready') return null
    return records.find(r => r.createdBy === user.id) ?? null
  }, [records, status, user])

  useEffect(() => {
    if (status === 'error') {
      console.error('Failed to load editor settings:', error || 'Unknown query error')
      initializedRef.current = true
      return
    }

    if (status !== 'ready' || !user || initializedRef.current) return

    if (ownRecord) {
      recordIdRef.current = ownRecord.recordId
      setLocalSettings(normalizeSettings(ownRecord.data as Partial<EditorSettings>))
      initializedRef.current = true
    } else {
      if (createInFlightRef.current) return
      createInFlightRef.current = true
      void (async () => {
        try {
          const id = await create(DEFAULT_EDITOR_SETTINGS)
          if (id) {
            recordIdRef.current = id
          } else {
            console.error('Editor settings initialization did not return a record id.')
          }
        } catch (createError) {
          console.error('Failed to initialize editor settings:', createError)
        } finally {
          initializedRef.current = true
          createInFlightRef.current = false
        }
      })()
    }
  }, [status, error, user, ownRecord, create])

  // Sync remote updates after initialization so home/editor stay in sync.
  useEffect(() => {
    if (!initializedRef.current || !ownRecord) return
    recordIdRef.current = ownRecord.recordId
    const next = normalizeSettings(ownRecord.data as Partial<EditorSettings>)
    setLocalSettings(prev => (areSettingsEqual(prev, next) ? prev : next))
  }, [ownRecord])

  const updateSetting = useCallback(<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    setLocalSettings(prev => {
      const next = { ...prev, [key]: value }
      if (recordIdRef.current) {
        put(recordIdRef.current, next)
      }
      return next
    })
  }, [put])

  const updateSettings = useCallback((partial: Partial<EditorSettings>) => {
    setLocalSettings(prev => {
      const next = { ...prev, ...partial }
      if (recordIdRef.current) {
        put(recordIdRef.current, next)
      }
      return next
    })
  }, [put])

  return {
    settings: localSettings,
    updateSetting,
    updateSettings,
    isReady: status === 'ready',
  }
}
