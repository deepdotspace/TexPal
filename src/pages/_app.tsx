/**
 * App — global providers + shell.
 *
 * Generouted renders this around all routes.
 * Providers → auth gate → page outlet.
 */

import { Suspense, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { DeepSpaceAuthProvider, useAuth } from 'deepspace'
import { RecordProvider, RecordScope } from 'deepspace'
import { ToastProvider } from '../components/ui'
import { SCOPE_ID } from '../constants'
import { schemas } from '../schemas'

export default function App() {
  return (
    <ToastProvider>
      <DeepSpaceAuthProvider>
        <AuthGate>
          <div className="h-screen bg-surface overflow-hidden flex flex-col">
            <Suspense fallback={null}>
              <Outlet />
            </Suspense>
          </div>
        </AuthGate>
      </DeepSpaceAuthProvider>
    </ToastProvider>
  )
}

function AuthGate({ children }: { children: ReactNode }) {
  const { isLoaded } = useAuth()

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-content-secondary text-sm">Loading TeXPal...</div>
        </div>
      </div>
    )
  }

  return (
    <RecordProvider allowAnonymous>
      <RecordScope roomId={SCOPE_ID} schemas={schemas}>
        {children}
      </RecordScope>
    </RecordProvider>
  )
}
