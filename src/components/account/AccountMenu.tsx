/**
 * AccountMenu — the signed-in user's avatar with a log-out control.
 *
 * Lives in the home-page top bar (the hub every signed-in user lands on and
 * can reach from the editor via the sidebar Home button). Built from the app's
 * own design tokens rather than the unused shadcn primitives so it matches the
 * surrounding chrome in both light and dark themes.
 *
 * On log out we call `signOut()` from the SDK and then do a full navigation to
 * the landing page ('/'). A hard navigation (not a client route change) tears
 * down the authenticated RecordProvider WebSocket so the session resets cleanly
 * to the signed-out landing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useUser, signOut } from 'deepspace'

function initialsFor(name?: string, email?: string): string {
  const source = (name || email || '').trim()
  if (!source) return '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return source[0].toUpperCase()
}

export function AccountMenu() {
  const { user } = useUser()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleSignOut = useCallback(async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      /* even if the network call fails, drop the user to the landing */
    } finally {
      window.location.href = '/'
    }
  }, [signingOut])

  if (!user) return null

  const displayName = user.name || user.email || 'Account'
  const initials = initialsFor(user.name, user.email)

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        title={displayName}
        className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden bg-accent text-white text-xs font-semibold select-none transition-transform hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12, ease: [0.2, 0.65, 0.3, 1] }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 mt-2 w-56 z-30 rounded-panel bg-surface-elevated border border-border shadow-card-hover p-1"
          >
            <div className="px-3 py-2">
              <div className="text-sm font-medium text-content truncate">{displayName}</div>
              {user.email && user.email !== displayName && (
                <div className="text-xs text-content-secondary truncate">{user.email}</div>
              )}
            </div>

            <div className="h-px bg-border -mx-1 my-1" />

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-button text-sm text-content hover:bg-surface-inset transition-colors disabled:opacity-60 disabled:cursor-default"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-content-secondary shrink-0"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {signingOut ? 'Logging out...' : 'Log out'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
