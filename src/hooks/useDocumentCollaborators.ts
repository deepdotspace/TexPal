/**
 * useDocumentCollaborators — stub for document collaboration info.
 *
 * The new DeepSpace SDK uses a single shared room. This provides
 * a compatible API surface.
 */

export interface TeamInfo {
  memberCount: number
  members: { userId: string; name?: string; imageUrl?: string; status: string }[]
}

export function useDocumentCollaborators(): Map<string, TeamInfo> {
  return new Map()
}
