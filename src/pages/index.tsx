/**
 * Landing / redirect page.
 * Signed-in users who have seen the landing go straight to /home.
 * Otherwise shows the landing page with a CTA.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const [showAuthOverlay, setShowAuthOverlay] = useState(false)

  const shouldSkip = isSignedIn && hasSeenLanding(user?.id)

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
