/**
 * useDocumentTeam — stub for team management.
 *
 * The new DeepSpace SDK uses a single shared room instead of per-document
 * teams. This hook provides a compatible API surface that downstream
 * components can consume without breaking.
 */

import { useMemo } from 'react'
import { useUser, useUsers } from 'deepspace'

export interface TeamMember {
  userId: string
  name?: string
  email?: string
  imageUrl?: string
  role: string
  status: 'active' | 'pending'
}

export function useDocumentTeam() {
  const { user } = useUser()
  const { users } = useUsers()

  const members: TeamMember[] = useMemo(() => {
    if (!users) return []
    return users.map((u: any) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      imageUrl: u.imageUrl,
      role: u.role || 'member',
      status: 'active' as const,
    }))
  }, [users])

  return {
    teamId: null,
    members,
    isOwner: true,
    isLoading: false,
    inviteByEmail: async () => ({ status: 'error' as const, message: 'Team invites not available in SDK mode' }),
    inviteByUsername: async () => ({ status: 'error' as const, message: 'Team invites not available in SDK mode' }),
    inviteByUserId: async () => ({ status: 'error' as const, message: 'Team invites not available in SDK mode' }),
    removeMember: () => {},
    cancelInvite: () => {},
    refresh: () => {},
  }
}
