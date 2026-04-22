import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useUser, useQuery, useMutations } from 'deepspace'
import {
  getSortedActiveDocumentRecordsForUser,
  type ActiveDocumentContextRecord,
} from '../utils/activeDocumentContext'

export interface ActiveDocumentContextValue {
  activeDocumentId: string
  activeDocumentTitle: string
  activeFilePath: string
}

const EMPTY_ACTIVE_DOCUMENT_CONTEXT: ActiveDocumentContextValue = {
  activeDocumentId: '',
  activeDocumentTitle: '',
  activeFilePath: '',
}

function hasMatchingContext(
  record: ActiveDocumentContextRecord | null,
  nextContext: ActiveDocumentContextValue,
): boolean {
  if (!record) return false

  return (
    (record.data.activeDocumentId || '') === nextContext.activeDocumentId &&
    (record.data.activeDocumentTitle || '') === nextContext.activeDocumentTitle &&
    (record.data.activeFilePath || '') === nextContext.activeFilePath
  )
}

export function useActiveDocumentContext() {
  const { user } = useUser()
  const { records, status } = useQuery('activeLatexDocId')
  const {
    createConfirmed,
    putConfirmed,
    removeConfirmed,
  } = useMutations('activeLatexDocId')

  const staleDeleteInFlightRef = useRef<Set<string>>(new Set())
  const pendingRecordIdRef = useRef<string | null>(null)

  const currentUserRecords = useMemo<ActiveDocumentContextRecord[]>(() => {
    if (!user) return []

    const queriedRecords = Array.isArray(records)
      ? (records as ActiveDocumentContextRecord[])
      : []

    return getSortedActiveDocumentRecordsForUser(queriedRecords, user.id)
  }, [records, user])

  const currentRecord = currentUserRecords[0] ?? null
  const staleRecordIds = useMemo(
    () => currentUserRecords.slice(1).map(record => record.recordId),
    [currentUserRecords],
  )

  useEffect(() => {
    if (!user || staleRecordIds.length === 0) return

    for (const staleRecordId of staleRecordIds) {
      if (staleDeleteInFlightRef.current.has(staleRecordId)) continue

      staleDeleteInFlightRef.current.add(staleRecordId)

      void removeConfirmed(staleRecordId)
        .catch((error: unknown) => {
          console.error('Failed to delete stale active document record:', error)
        })
        .finally(() => {
          staleDeleteInFlightRef.current.delete(staleRecordId)
        })
    }
  }, [user, staleRecordIds, removeConfirmed])

  useEffect(() => {
    if (currentRecord?.recordId) {
      pendingRecordIdRef.current = currentRecord.recordId
    }
  }, [currentRecord])

  const upsertActiveDocumentContext = useCallback(async (
    nextContext: ActiveDocumentContextValue,
  ) => {
    if (!user) {
      throw new Error('Cannot update active document context without a signed-in user.')
    }

    if (hasMatchingContext(currentRecord, nextContext)) {
      return currentRecord.recordId
    }

    const payload = {
      activeDocumentId: nextContext.activeDocumentId,
      activeDocumentTitle: nextContext.activeDocumentTitle,
      activeFilePath: nextContext.activeFilePath,
      updatedAt: Date.now(),
    }

    const targetRecordId = currentRecord?.recordId || pendingRecordIdRef.current
    if (targetRecordId) {
      try {
        await putConfirmed(targetRecordId, payload)
        pendingRecordIdRef.current = targetRecordId
        return targetRecordId
      } catch (error) {
        if (currentRecord?.recordId) {
          throw error
        }

        pendingRecordIdRef.current = null
      }
    }

    const recordId = await createConfirmed({
      userId: user.id,
      ...payload,
    })

    pendingRecordIdRef.current = recordId
    return recordId
  }, [user, currentRecord, putConfirmed, createConfirmed])

  const clearActiveDocumentContext = useCallback(async () => {
    return upsertActiveDocumentContext(EMPTY_ACTIVE_DOCUMENT_CONTEXT)
  }, [upsertActiveDocumentContext])

  return {
    currentRecord,
    currentContext: currentRecord?.data ?? EMPTY_ACTIVE_DOCUMENT_CONTEXT,
    status,
    upsertActiveDocumentContext,
    clearActiveDocumentContext,
  }
}
