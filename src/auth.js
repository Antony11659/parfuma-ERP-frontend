import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { createErpApi, ErpApiError } from './erpApi'

function createAuthClient() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key?.startsWith('sb_publishable_')) return null

  try {
    return createClient(url, key, {
      auth: { storageKey: 'parfuma-erp-auth', detectSessionInUrl: false },
    })
  } catch {
    return null
  }
}

export const authClient = createAuthClient()
export const erpApi = createErpApi({
  baseUrl: import.meta.env.VITE_ERP_API_BASE_URL?.trim(),
  allowLocalHttp: import.meta.env.DEV,
  getSession: () => authClient.auth.getSession(),
})

export function useStaffSession() {
  const [session, setSession] = useState(undefined)
  const [verification, setVerification] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const token = session?.access_token

  useEffect(() => {
    if (!authClient) return
    const { data: { subscription } } = authClient.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!nextSession) setVerification(null)
        setSession(nextSession)
      },
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()

    async function verify() {
      try {
        const staff = await erpApi.request('/erp/me', { signal: controller.signal })
        if (staff?.erpStaff !== true || typeof staff.id !== 'string' || !staff.id
          || (staff.email !== null && typeof staff.email !== 'string')) {
          throw new ErpApiError('response', 'The ERP backend returned an unexpected account response.')
        }
        if (!controller.signal.aborted) {
          setVerification({ token, attempt, status: 'staff', email: staff.email })
        }
      } catch (error) {
        if (controller.signal.aborted) return
        const status = error?.code === 'forbidden' ? 'denied' : 'error'
        setVerification({
          token,
          attempt,
          status,
          message: error instanceof ErpApiError ? error.message : 'Could not verify ERP access.',
        })
      }
    }

    void verify()
    return () => controller.abort()
  }, [token, attempt])

  const current = verification?.token === token && verification?.attempt === attempt
    ? verification
    : null

  return {
    status: session === undefined || (token && !current) ? 'loading' : current?.status ?? 'signedOut',
    email: current?.email,
    message: current?.message,
    retry: () => setAttempt(value => value + 1),
  }
}
