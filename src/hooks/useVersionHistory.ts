/**
 * useVersionHistory — manage compiled PDF + LaTeX source versions per document.
 *
 * Stores pdfUrl and the entry file's latexSource for each compile.
 * Enforces VERSION_CAP; oldest version is removed when limit exceeded.
 */

import { useMemo, useCallback } from 'react'
import { useQuery, useMutations, useUser, useR2Files, getAuthToken } from 'deepspace'
import { VERSION_CAP } from '../constants'

export interface VersionRecord {
  recordId: string
  data: {
    documentId: string
    pdfUrl: string
    pdfKey?: string
    latexSource: string
    compiler?: string
    compiledAt: number
    versionNum: number
  }
}

export function useVersionHistory(documentId: string | null) {
  const { user } = useUser()
  const { records, status } = useQuery('documentVersions', {
    where: documentId ? { documentId } : { documentId: '' },
    orderBy: 'versionNum',
    orderDir: 'desc',
  })
  const { create, remove } = useMutations('documentVersions')
  const { deleteFile } = useR2Files()

  const versions = useMemo<VersionRecord[]>(() => {
    if (!user || status !== 'ready' || !documentId) return []
    return records
      .filter((r: any) => r.data.documentId === documentId)
      .map((r: any) => ({
        recordId: r.recordId,
        data: {
          documentId: r.data.documentId as string,
          pdfUrl: r.data.pdfUrl as string,
          pdfKey: r.data.pdfKey as string | undefined,
          latexSource: r.data.latexSource as string,
          compiler: r.data.compiler as string | undefined,
          compiledAt: r.data.compiledAt as number,
          versionNum: r.data.versionNum as number,
        },
      }))
      .sort((a: VersionRecord, b: VersionRecord) => b.data.versionNum - a.data.versionNum)
  }, [records, status, user, documentId])

  const addVersion = useCallback(
    async (opts: {
      pdfUrl: string
      pdfKey?: string
      latexSource: string
      compiler: string
    }): Promise<string | null> => {
      if (!documentId) return null

      const nextVersionNum =
        versions.length > 0 ? Math.max(...versions.map(v => v.data.versionNum)) + 1 : 1

      if (versions.length >= VERSION_CAP) {
        const oldest = versions[versions.length - 1]
        // Best-effort delete of R2 file
        if (oldest.data.pdfKey) {
          deleteFile(oldest.data.pdfKey).catch(() => {})
        }
        remove(oldest.recordId)
      }

      const recordId = await create({
        documentId,
        pdfUrl: opts.pdfUrl,
        pdfKey: opts.pdfKey,
        latexSource: opts.latexSource,
        compiler: opts.compiler,
        compiledAt: Date.now(),
        versionNum: nextVersionNum,
      })
      return recordId ?? null
    },
    [documentId, versions, create, remove]
  )

  const getPdfUrl = useCallback(async (version: VersionRecord): Promise<string> => {
    const url = version.data.pdfUrl
    // Blob URLs work directly; R2 URLs need authenticated fetch for PDF.js
    if (url.startsWith('blob:')) return url
    try {
      const token = await getAuthToken()
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const resp = await fetch(url, { headers })
      if (!resp.ok) throw new Error(`PDF fetch failed: ${resp.status}`)
      const blob = await resp.blob()
      return URL.createObjectURL(blob)
    } catch {
      return url
    }
  }, [])

  return { versions, isReady: status === 'ready', addVersion, getPdfUrl }
}
