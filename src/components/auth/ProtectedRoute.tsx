import React from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from 'deepspace'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useUser()

  // While user is loading, render nothing to avoid a flash redirect
  if (isLoading) return null

  if (!user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
