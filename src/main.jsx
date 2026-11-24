import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { authClient, useStaffSession } from './auth'
import Dashboard from './Dashboard'
import './styles.css'

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">P</span>
      <span>PARFUMA <small>ERP</small></span>
    </div>
  )
}

function SignIn({ onPreview }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError('')
    try {
      const { error: signInError } = await authClient.auth.signInWithPassword({
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
      })
      if (signInError) setError('Sign-in failed. Check your credentials or try again.')
    } catch {
      setError('Sign-in is temporarily unavailable. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="entry">
      <section className="entry-card" aria-labelledby="entry-title">
        <Brand />
        <h1 id="entry-title">Staff sign-in</h1>
        {authClient ? (
          <form onSubmit={submit}>
            <label>Work email<input name="email" type="email" autoComplete="username" required /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            {error && <p role="alert">{error}</p>}
            <button className="primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
          </form>
        ) : (
          <>
            <p>Configure Supabase Auth to enable staff sign-in.</p>
            {onPreview && <button className="primary" onClick={onPreview}>Open dashboard preview</button>}
          </>
        )}
      </section>
    </main>
  )
}

function AuthenticatedApp() {
  const { status, email, message, retry } = useStaffSession()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const { error: signOutError } = await authClient.auth.signOut({ scope: 'local' })
      if (signOutError) setError('Sign-out failed. Try again.')
    } catch {
      setError('Sign-out failed. Try again.')
    } finally {
      setSigningOut(false)
    }
  }

  if (status === 'signedOut') return <SignIn />

  const action = <button onClick={signOut} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
  if (status === 'staff') {
    return <Dashboard brand={<Brand />} email={email} action={action} error={error} />
  }

  const title = {
    loading: 'Checking session…',
    denied: 'Staff access required',
    error: 'Could not verify staff access',
  }[status]

  return (
    <main className="entry">
      <section className="entry-card" aria-labelledby="session-title">
        <Brand />
        <h1 id="session-title" aria-live="polite">{title}</h1>
        {status === 'denied' && <p>Ask an ERP administrator to grant access to your account.</p>}
        {status === 'error' && <p role="alert">{message}</p>}
        <div className="actions">
          {status === 'error' && <button onClick={retry}>Try again</button>}
          {status !== 'loading' && action}
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  )
}

function App() {
  const [preview, setPreview] = useState(false)
  if (authClient) return <AuthenticatedApp />
  if (import.meta.env.DEV && preview) {
    return <Dashboard brand={<Brand />} action={<button onClick={() => setPreview(false)}>Exit preview</button>} preview />
  }
  return <SignIn onPreview={import.meta.env.DEV ? () => setPreview(true) : undefined} />
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
