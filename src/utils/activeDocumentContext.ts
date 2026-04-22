export interface ActiveDocumentContextRecord {
  recordId: string
  createdBy?: string
  createdAt?: string | number
  updatedAt?: string | number
  data: {
    userId?: string
    activeDocumentId?: string
    activeDocumentTitle?: string
    activeFilePath?: string
    updatedAt?: number
  }
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim()
    if (!trimmedValue) return 0

    const numericValue = Number(trimmedValue)
    if (Number.isFinite(numericValue)) {
      return numericValue
    }

    const parsedValue = Date.parse(trimmedValue)
    if (!Number.isNaN(parsedValue)) {
      return parsedValue
    }
  }

  return 0
}

function getRecordFreshness(record: ActiveDocumentContextRecord): number {
  return Math.max(
    toTimestamp(record.data.updatedAt),
    toTimestamp(record.updatedAt),
    toTimestamp(record.createdAt),
  )
}

export function isCurrentUserActiveDocumentRecord(
  record: ActiveDocumentContextRecord,
  userId: string,
): boolean {
  return record.createdBy === userId || record.data.userId === userId
}

export function getSortedActiveDocumentRecordsForUser(
  records: ActiveDocumentContextRecord[],
  userId: string,
): ActiveDocumentContextRecord[] {
  return records
    .filter(record => isCurrentUserActiveDocumentRecord(record, userId))
    .sort((leftRecord, rightRecord) => getRecordFreshness(rightRecord) - getRecordFreshness(leftRecord))
}
