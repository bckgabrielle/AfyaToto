import React, { useEffect, useState, lazy, Suspense } from 'react'
import { api, asDateString, MOCK } from './api'
import { tr as mk } from './content'
import Mother from './Mother.jsx'

const Chw = lazy(() => import('./Chw.jsx'))

function Login({ onLogin, lang, tr }) {
  const [mode, setMode] = useState('m')
  const [motherMode, setMotherMode] = useState('login')
  const [form, setForm] = useState({ name: '', phone: '', area: '', expectedDeliveryDate: '', consent: false, username: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function submit(action) {
    setBusy(true)
    setError('')
    try { await action() } catch (issue) { setError(issue.message || tr('offline')) } finally { setBusy(false) }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  return (
    <div className="login card">
      <h2><svg viewBox="0 0 24 24" className="heart" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" /></svg>Afya Toto</h2>
      <div className="seg"><button className={mode === 'm' ? 'on' : ''} onClick={() => switchMode('m')}>{tr('tabm')}</button><button className={mode === 'h' ? 'on' : ''} onClick={() => switchMode('h')}>{tr('tabh')}</button></div>
      {mode === 'm' ? (
        <>
          <div className="seg"><button type="button" className={motherMode === 'login' ? 'on' : ''} onClick={() => setMotherMode('login')}>{tr('login')}</button><button type="button" className={motherMode === 'register' ? 'on' : ''} onClick={() => setMotherMode('register')}>{tr('register')}</button></div>
          {motherMode === 'register' && <label className="field">{tr('fullName')}<input required minLength="2" maxLength="120" autoComplete="name" value={form.name} onChange={set('name')} /></label>}
          <label className="field">{tr('phone')}<input required inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></label>
          {motherMode === 'register' && <>
            <label className="field">{tr('area')}<input autoComplete="address-level2" value={form.area} onChange={set('area')} /></label>
            <label className="field">{tr('expectedDelivery')}<input required type="date" value={form.expectedDeliveryDate} onChange={set('expectedDeliveryDate')} /></label>
          </>}
          <label className="field">{tr('pass')}<input required type="password" minLength="8" autoComplete={motherMode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} /></label>
          {motherMode === 'register' && <label className="opt"><input required type="checkbox" checked={form.consent} onChange={(event) => setForm((current) => ({ ...current, consent: event.target.checked }))} />{tr('consentRegister')}</label>}
          {motherMode === 'register'
            ? <button disabled={busy || !form.name.trim() || !form.phone.trim() || !form.expectedDeliveryDate || !form.consent || form.password.length < 8} onClick={() => submit(async () => onLogin(await api.registerMother(form)))}>{busy ? '…' : tr('createAccount')}</button>
            : <button disabled={busy || !form.phone.trim() || !form.password} onClick={() => submit(async () => onLogin(await api.loginMother(form.phone, form.password)))}>{busy ? '…' : tr('login')}</button>}
        </>
      ) : (
        <>
          <label className="field">{tr('user')}<input autoComplete="username" value={form.username} onChange={set('username')} /></label>
          <label className="field">{tr('pass')}<input type="password" autoComplete="current-password" value={form.password} onChange={set('password')} /></label>
          <button disabled={busy || !form.username.trim() || !form.password} onClick={() => submit(async () => onLogin(await api.login(form.username, form.password)))}>{busy ? '…' : tr('login')}</button>
        </>
      )}
      {MOCK && <p className="muted">{tr('demo')}</p>}
      {error && <p className="err" role="alert">{error}</p>}
    </div>
  )
}

function ProfileSetup({ profile, onSave, lang }) {
  const [form, setForm] = useState({
    name: profile?.name || '',
    area: profile?.area || '',
    expectedDeliveryDate: asDateString(profile?.edd) || '',
    consent: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sw = lang === 'sw'
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onSave({ ...form, expectedDeliveryDate: form.expectedDeliveryDate || null, consent: true })
    } catch (issue) {
      setError(issue.message || (sw ? 'Imeshindikana kuhifadhi taarifa.' : 'Could not save your profile.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login card" onSubmit={save}>
      <h2>{sw ? 'Mipangilio ya wasifu' : 'Set up your profile'}</h2>
      <label>{sw ? 'Jina kamili' : 'Full name'}<input required minLength="2" maxLength="120" value={form.name} onChange={set('name')} /></label>
      <label>{sw ? 'Eneo' : 'Area'}<input maxLength="120" value={form.area} onChange={set('area')} /></label>
      <label>{sw ? 'Tarehe inayotarajiwa ya kujifungua' : 'Expected delivery date'}<input required type="date" value={form.expectedDeliveryDate} onChange={set('expectedDeliveryDate')} /></label>
      <label className="opt"><input required type="checkbox" checked={form.consent} onChange={(event) => setForm((current) => ({ ...current, consent: event.target.checked }))} />
        {sw ? 'Ninakubali taarifa zangu zitumike kutoa huduma za afya ya mama na mtoto.' : 'I agree to the use of my information to provide maternal and child health services.'}
      </label>
      <button disabled={busy || !form.consent}>{busy ? '…' : (sw ? 'Hifadhi wasifu' : 'Save profile')}</button>
      {error && <p className="err" role="alert">{error}</p>}
    </form>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [ready, setReady] = useState(false)
  const [lang, setLang] = useState(localStorage.getItem('at_lang') || 'en')
  const [online, setOnline] = useState(navigator.onLine)
  const tr = mk(lang)

  useEffect(() => {
    let active = true
    async function restore() {
      try {
        const current = await api.me()
        if (!active || !current) return
        setSession(current)
        if (current.role === 'mother') setProfile(await api.getProfile())
      } catch {
        if (MOCK) sessionStorage.removeItem('at_demo_session')
      } finally {
        if (active) setReady(true)
      }
    }
    restore()
    return () => { active = false }
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    addEventListener('online', on)
    addEventListener('offline', off)
    return () => { removeEventListener('online', on); removeEventListener('offline', off) }
  }, [])

  async function login(result) {
    if (MOCK) sessionStorage.setItem('at_demo_session', JSON.stringify(result))
    setSession(result)
    if (result.role === 'mother') setProfile(await api.getProfile())
  }

  async function saveProfile(value) {
    const saved = await api.updateProfile(value)
    setProfile(saved)
  }

  async function logout() {
    try { await api.logout() } finally { setSession(null); setProfile(null) }
  }

  function pickLanguage(next) {
    setLang(next)
    localStorage.setItem('at_lang', next)
  }

  if (!ready) return <div className="mshell"><p className="muted">Loading…</p></div>
  if (session?.role === 'chw' || session?.role === 'admin') {
    return <Suspense fallback={<p className="muted">Loading…</p>}><Chw onLogout={logout} role={session.role} /></Suspense>
  }

  return (
    <div className="mshell"><div className="kanga" />
      <a className="skip-link" href="#main-content">{lang === 'sw' ? 'Ruka hadi maudhui' : 'Skip to content'}</a>
      <header className="brand-header"><div className="brand-lockup"><span className="brand-mark"><svg viewBox="0 0 24 24" className="heart" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" /></svg></span><span className="wordmark"><b>Afya Toto</b><small>{lang === 'sw' ? 'Afya ya mama na mtoto' : 'Mother & child care'}</small></span></div>
        <span><button className="ghost" onClick={() => pickLanguage(lang === 'en' ? 'sw' : 'en')}>{lang === 'en' ? 'Kiswahili' : 'English'}</button>
          {session && <button className="ghost" onClick={logout}>{tr('logout')}</button>}</span></header>
      {!online && <div className="alert" role="status">{lang === 'sw' ? 'Hakuna mtandao. Taarifa zinaweza kuwa za zamani; mabadiliko mapya hayatahifadhiwa.' : 'Offline. Information may be out of date; new activity will not be saved.'}</div>}
      <main id="main-content">{session
        ? !profile?.consentAt
          ? <ProfileSetup profile={profile} onSave={saveProfile} lang={lang} />
          : <Mother user={{ ...session.user, ...profile }} lang={lang} />
        : <Login onLogin={login} lang={lang} tr={tr} />}</main>
    </div>
  )
}