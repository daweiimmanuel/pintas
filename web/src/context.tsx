import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { initApi } from './api'

interface Session {
  apiKey: string
  exporterId: string
  buyerId: string
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/app/session')
      .then(r => r.json())
      .then((data: Session) => {
        initApi(data.apiKey)
        setSession(data)
      })
      .catch(e => setError(String(e)))
  }, [])

  if (error) {
    return (
      <div className="loading-screen">
        Failed to load session: {error}
      </div>
    )
  }
  if (!session) {
    return <div className="loading-screen">Loading...</div>
  }

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
