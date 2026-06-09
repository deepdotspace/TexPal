/**
 * Landing / redirect page.
 * Signed-in users who have seen the landing go straight to /home.
 * Otherwise shows the landing page with a CTA.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, useUser, AuthOverlay } from 'deepspace'
import LandingPageV2 from '../components/landing/LandingPageV2'

const LANDING_SEEN_KEY_PREFIX = 'texpal_seen_landing_'

function hasSeenLanding(userId: string | undefined): boolean {
  if (!userId) return false
  try {
    return localStorage.getItem(LANDING_SEEN_KEY_PREFIX + userId) === '1'
  } catch {
    return false
  }
}

function markLandingSeen(userId: string | undefined) {
  if (!userId) return
  try {
    localStorage.setItem(LANDING_SEEN_KEY_PREFIX + userId, '1')
  } catch { /* non-critical */ }
}

export default function LandingRoute() {
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showAuthOverlay, setShowAuthOverlay] = useState(false)

  // `?landing=1` (or `?landing`) forces the landing view even for users who've
  // seen it before. The editor's top-bar "Back to TeXPal" link uses this so a
  // returning signed-in user can still get back to the landing instead of
  // bouncing straight to /home.
  const forceLanding = searchParams.has('landing')

  const shouldSkip = !forceLanding && isSignedIn && hasSeenLanding(user?.id)

  useEffect(() => {
    if (shouldSkip) {
      navigate('/home', { replace: true })
    }
  }, [shouldSkip, navigate])

  const handleOpenEditor = useCallback(() => {
    if (!isSignedIn) {
      setShowAuthOverlay(true)
      return
    }
    markLandingSeen(user?.id)
    navigate('/home')
  }, [isSignedIn, user?.id, navigate])

  useEffect(() => {
    if (showAuthOverlay && isSignedIn) {
      markLandingSeen(user?.id)
      setShowAuthOverlay(false)
      navigate('/home')
    }
  }, [showAuthOverlay, isSignedIn, user?.id, navigate])

  if (shouldSkip) return null

  return (
    <>
      <LandingPageV2 onOpenEditor={handleOpenEditor} />
      {showAuthOverlay && !isSignedIn && <AuthOverlay />}
    </>
  )
}
