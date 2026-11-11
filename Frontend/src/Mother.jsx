import React, { useEffect, useState } from 'react'
import { fmt, gest, status, Badge } from './util.jsx'
import { SYMPTOMS, tr as mk } from './content'
import { api } from './api'

const P = { home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', record: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 8h6M9 12h6M9 16h4', child: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0M19 8v6M16 11h6', check: 'M12 3l10 18H2zM12 10v5M12 18h.01', ask: 'M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-5.5A8 8 0 1 1 21 12z' }
const Icon = ({ k }) => <svg viewBox="0 0 24 24" className="ic" aria-hidden="true"><path d={P[k]} /></svg>

function ordinalSuffix(number) {
  const lastTwo = number % 100
  if (lastTwo >= 11 && lastTwo <= 13) return 'th'
  return ({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] || 'th'
}

function Home({ m, appointments, reminders, children, articles, tr }) {
  const week = gest(m)
  const nextAnc = appointments
    .filter((item) => item.type === 'anc' && item.status === 'scheduled')
    .sort((a, b) => a.dueDate - b.dueDate)[0]
  const completed = appointments.filter((item) => item.type === 'anc' && item.status === 'completed').length
  const daysUntilVisit = nextAnc ? Math.ceil((nextAnc.dueDate.getTime() - Date.now()) / 86_400_000) : null
  const isVisitOverdue = daysUntilVisit !== null && daysUntilVisit < 0
  const nextCare = appointments.filter((item) => item.status === 'scheduled').sort((a, b) => a.dueDate - b.dueDate)[0]
  const nextVaccine = appointments.filter((item) => item.type === 'immunization' && item.status === 'scheduled').sort((a, b) => a.dueDate - b.dueDate)[0]
  const guidance = articles.slice(0, 3)
  return (
    <div className="mom-home">
      <section className="mom-hero" aria-labelledby="mom-greeting">
        <div className="mom-hero-head">
          <div className="mom-avatar" aria-hidden="true">{m.avatar || '🤰🏾'}</div>
          <div className="mom-greeting"><h1 id="mom-greeting">{tr('hello')}, {m.name.split(' ')[0]} <span aria-hidden="true">♥</span></h1><p>{tr('journeySubtitle')}</p></div>
          <div className="due-chip"><span className="calendar-icon" aria-hidden="true">▦</span><span>{tr('edd')}<b>{fmt(m.edd)}</b></span></div>
        </div>
        <div className="pregnancy-stage">
          <div className="week-number"><span>{tr('weekLabel')}</span><strong>{week ?? '—'}<sup>{week ? ordinalSuffix(week) : ''}</sup></strong><small>{tr('pregnancyWeek')}</small><div className="beads" role="img" aria-label={`${week ?? 0} ${tr('ofPregnancyWeeks')}`}>{Array.from({ length: 40 }, (_, index) => <i key={index} className={index < (week || 0) ? 'on' : ''} />)}</div></div>
          <div className="mother-illustration" role="img" aria-label={tr('motherIllustration')}>{m.avatar || '🤰🏾'}<i aria-hidden="true">✦</i></div>
        </div>
        <div className="hero-stats">
          <div className="glass-stat"><span aria-hidden="true">♡</span><small>{tr('visitsComplete')}</small><b>{completed}<em> / 8</em></b></div>
          <div className={`glass-stat ${isVisitOverdue ? 'overdue' : ''}`}><span aria-hidden="true">⌁</span><small>{isVisitOverdue ? tr('visitOverdue') : tr('daysToVisit')}</small><b>{daysUntilVisit === null ? '—' : Math.abs(daysUntilVisit)}<em>{daysUntilVisit === null ? '' : isVisitOverdue ? tr('daysOverdue') : tr('days')}</em></b></div>
        </div>
        <div className="size-card">
          <div><small>{tr('growingThisWeek')}</small><b>{tr('babyGrowthTitle')}</b><p>{tr('babyGrowthCopy')}</p></div>
          <span className="size-illustration" aria-hidden="true">🫶🏽</span>
        </div>
      </section>

      <section className="journey-section" aria-labelledby="journey-title">
        <div className="section-heading"><div><p className="eyebrow">{tr('first1000')}</p><h2 id="journey-title">{week ? `${tr('weekLabel')} ${week} · ${tr('pregnancyStage')}` : tr('journeyTitle')}</h2><p className="scope-line">{tr('first1000Scope')}</p></div><span className="section-mark" aria-hidden="true">✿</span></div>
        <div className="journey-cards">
          <article className="journey-row metric-visit"><span aria-hidden="true">◷</span><div><small>{tr('nextCare')}</small><b>{nextCare?.title || tr('noAppointments')}</b></div><strong>{nextCare ? fmt(nextCare.dueDate) : '—'}</strong></article>
          <article className="journey-row metric-child"><span aria-hidden="true">♡</span><div><small>{tr('childHealth')}</small><b>{children.length ? `${children.length} ${tr('childProfiles')}` : tr('noChildProfile')}</b>{nextVaccine && <em>{nextVaccine.title} · {fmt(nextVaccine.dueDate)}</em>}</div></article>
          <article className="journey-row metric-reminder"><span aria-hidden="true">✿</span><div><small>{tr('motherBabyGuidance')}</small><b>{guidance.length ? tr('reviewedHealthInfo') : tr('contentReviewPending')}</b></div></article>
        </div>
        <div className="section-heading subheading"><h3>{tr('upcomingAppointments')}</h3></div>
        <div className="appointment-rail">
          {appointments.filter((item) => item.status === 'scheduled').sort((a, b) => a.dueDate - b.dueDate).slice(0, 4).map((item) => <article className="appointment-tile" key={item.id}>
            <div className="appointment-date"><b>{item.dueDate.getDate()}</b><span>{item.dueDate.toLocaleDateString('en', { month: 'short' })}</span></div>
            <div><b>{item.title}</b><small>{fmt(item.dueDate)}</small></div>
            <Badge s={status(item.dueDate)} />
          </article>)}
          {!appointments.some((item) => item.status === 'scheduled') && <p className="empty-note">{tr('noAppointments')}</p>}
        </div>
        {reminders.length > 0 && <div className="reminder-strip"><span aria-hidden="true">♧</span><div><b>{reminders[0].title}</b><p>{reminders[0].body}</p></div></div>}
        <div className="section-heading subheading"><h3>{tr('forYou')}</h3><span className="read-time">{guidance.length ? tr('reviewedHealthInfo') : ''}</span></div>
        {guidance.length ? guidance.map((item) => <article className="article-card" key={item.id || item.title}>
          <div className="article-art" aria-hidden="true">{item.category === 'urgent' ? '♡' : '✿'}</div>
          <div className="article-copy"><div className="article-tags"><span>{tr('weekLabel')} {week ?? '—'}</span><span>{tr('healthGuide')}</span></div><h4>{item.title}</h4><p>{item.body}</p></div>
        </article>) : <article className="article-card article-pending"><div className="article-art" aria-hidden="true">✿</div><div className="article-copy"><div className="article-tags"><span>{tr('weekLabel')} {week ?? '—'}</span><span>{tr('healthGuide')}</span></div><h4>{tr('forYou')}</h4><p>{tr('contentReviewPending')}</p></div></article>}
      </section>
    </div>
  )
}

function Record({ m, appointments, records, tr, onStatus, busyId }) {
  const items = [
    ...appointments.map((item) => ({ date: item.dueDate, label: item.title, status: item.status, id: item.id, appointment: true })),
    ...records.map((item) => ({ date: item.visit_date ? new Date(`${item.visit_date}T00:00:00`) : new Date(item.recorded_at), label: item.notes || item.record_type, status: 'recorded', id: item.id })),
  ].filter((item) => item.date instanceof Date && !Number.isNaN(item.date.getTime())).sort((a, b) => a.date - b.date)
  return (
    <div className="card"><h3>{tr('tl')}</h3>
      {items.length
        ? <ol className="tl">{items.map((item) => (
          <li key={item.id} className={item.status === 'completed' || item.status === 'recorded' ? 'done' : item.status === 'scheduled' && item.date < new Date() ? 'late' : ''}>
            <b>{fmt(item.date)}</b><span>{item.label} · {item.status}</span>
            {item.appointment && item.status === 'scheduled' && <button disabled={busyId === item.id} onClick={() => onStatus(item.id, 'completed')}>{busyId === item.id ? 'Saving…' : 'Mark attended'}</button>}
          </li>
        ))}</ol>
        : <p className="muted">{tr('noAppointments')}</p>}
      <p className="muted">{tr('edd')} {fmt(m.edd)}</p>
    </div>
  )
}

function ChildProfiles({ children, onCreate }) {
  const [form, setForm] = useState({ name: '', dateOfBirth: '', sex: 'unknown' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await onCreate(form)
      setForm({ name: '', dateOfBirth: '', sex: 'unknown' })
    } catch (issue) {
      setError(issue.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <form className="card" onSubmit={submit}>
        <h3>Register a child</h3>
        <div className="row"><label className="field">Child's name<input required maxLength="120" value={form.name} onChange={set('name')} /></label>
          <label className="field">Date of birth<input required type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} /></label>
          <label className="field">Sex<select value={form.sex} onChange={set('sex')}><option value="unknown">Not specified</option><option value="female">Female</option><option value="male">Male</option></select></label>
          <button disabled={busy}>{busy ? 'Saving…' : 'Create profile'}</button></div>
        {error && <p className="err" role="alert">{error}</p>}
      </form>
      {children.length ? <div className="grid">{children.map((child) => (
        <div className="card" key={child.id}><h3>{child.name}</h3><p className="muted">Born {fmt(child.dateOfBirth)}</p>
          {child.immunizations?.length
            ? <ul>{child.immunizations.map((item) => <li key={item.id || item.vaccineName}>{item.vaccineName} · {fmt(item.administeredOn)}</li>)}</ul>
            : <p className="muted">No immunisation records yet.</p>}
        </div>
      ))}</div> : <div className="card"><p className="muted">No child profiles yet.</p></div>}
    </>
  )
}

function Check({ tr, lang, onReported }) {
  const [sel, setSel] = useState([])
  const [reported, setReported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const tog = (id) => { setReported(false); setError(''); setSel((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id])) }
  async function report() {
    setError('')
    if (!sel.length) { setReported(true); return }
    const symptoms = SYMPTOMS.filter((item) => sel.includes(item.id))
    setBusy(true)
    try {
      await api.addMaternalRecord({
        recordType: 'danger_sign',
        notes: symptoms.map((item) => item[lang]).join('; '),
        data: { symptoms: symptoms.map((item) => item.id) },
      })
      setReported(true)
      onReported()
    } catch (issue) {
      setError(issue.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="card"><h3>{tr('check')}</h3>
      {['gm', 'gb'].map((g) => (
        <div key={g}><h4>{tr(g)}</h4>
          {SYMPTOMS.filter((s) => s.g === g).map((s) => (
            <label key={s.id} className="opt"><input type="checkbox" checked={sel.includes(s.id)} onChange={() => tog(s.id)} />{s[lang]}</label>
          ))}
        </div>
      ))}
      <button disabled={busy} onClick={report}>{busy ? '…' : tr('see')}</button>
      {error && <p className="err" role="alert">{error}</p>}
      {reported && (sel.length
        ? <div className="alert"><b>{tr('reportedSymptoms')}</b><ul>{SYMPTOMS.filter((item) => sel.includes(item.id)).map((item) => <li key={item.id}>{item[lang]}</li>)}</ul><p>{tr('urgent')}</p></div>
        : <div className="ok">{tr('noneok')}</div>)}
    </div>
  )
}

function Ask({ tr, lang }) {
  const [log, setLog] = useState([{ from: 'bot', t: tr('welcomeAsk'), provider: 'approved' }])
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = async () => {
    if (!v.trim() || busy) return
    const q = v
    setError('')
    setV(''); setBusy(true); setLog((l) => [...l, { from: 'me', t: q }])
    try { const r = await api.chat(q, lang); setLog((l) => [...l, { from: 'bot', t: r.answer, urgent: r.escalate, provider: r.provider }]) }
    catch (issue) { setError(issue.message || tr('offline')) }
    setBusy(false)
  }
  return (
    <div className="card"><h3>{tr('ask')}</h3>
      <p className="muted">{tr('chatPrivacy')}</p>
      <div className="chat" role="log" aria-live="polite" aria-relevant="additions">{log.map((l, i) => <div key={i} className={'bub ' + l.from + (l.urgent ? ' urgent' : '')}><p>{l.t}</p>{l.from === 'bot' && l.provider && <small>{l.provider === 'groq' ? tr('groqAssist') : tr('approvedGuide')}</small>}</div>)}</div>
      {busy && <p className="muted" role="status">{tr('thinking')}</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row chat-composer"><input aria-label={tr('typeq')} disabled={busy} value={v} placeholder={tr('typeq')} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button disabled={busy} onClick={send}>{tr('send')}</button></div>
      <p className="muted">{tr('disc')}</p>
    </div>
  )
}

export default function Mother({ user, lang }) {
  const [tab, setTab] = useState('home')
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [reminders, setReminders] = useState([])
  const [children, setChildren] = useState([])
  const [articles, setArticles] = useState([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const tr = mk(lang)
  async function reloadData() {
    const results = await Promise.allSettled([api.getAppointments(), api.getMaternalRecords(), api.getReminders(), api.getChildren(), api.getHealthContent(lang)])
    setAppointments(results[0].status === 'fulfilled' ? results[0].value : [])
    setRecords(results[1].status === 'fulfilled' ? results[1].value : [])
    setReminders(results[2].status === 'fulfilled' ? results[2].value : [])
    setChildren(results[3].status === 'fulfilled' ? results[3].value : [])
    setArticles(results[4].status === 'fulfilled' ? results[4].value : [])
    const failure = results.find((result) => result.status === 'rejected')
    setError(failure?.reason?.message || '')
  }
  useEffect(() => { reloadData() }, [lang])
  async function perform(id, action) {
    setBusyId(id)
    setError('')
    try { await action(); await reloadData() } catch (issue) { setError(issue.message) } finally { setBusyId('') }
  }
  const tabs = {
    home: () => <Home m={user} appointments={appointments} reminders={reminders} children={children} articles={articles} tr={tr} />,
    record: () => <Record m={user} appointments={appointments} records={records} tr={tr} onStatus={(id, value) => perform(id, () => api.updateAppointmentStatus(id, value))} busyId={busyId} />,
    child: () => <ChildProfiles children={children} onCreate={(child) => perform('child', () => api.addChild(child))} />,
    check: () => <Check tr={tr} lang={lang} onReported={reloadData} />,
    ask: () => <Ask tr={tr} lang={lang} />,
  }
  const View = tabs[tab]
  const primaryTabs = ['home', 'record', 'child', 'ask']
  return (
    <>
      {error && <div className="alert" role="status">{error}</div>}
      <View />
      <nav className="tabs mom-tabs" aria-label={lang === 'sw' ? 'Urambazaji mkuu' : 'Main navigation'}>
        {primaryTabs.slice(0, 2).map((key) => <button key={key} className={key === tab ? 'on' : ''} aria-current={key === tab ? 'page' : undefined} onClick={() => setTab(key)}><Icon k={key} /><span>{tr(key)}</span></button>)}
        <button type="button" className={`danger-action ${tab === 'check' ? 'on' : ''}`} aria-label={tr('check')} aria-pressed={tab === 'check'} onClick={() => setTab('check')}><Icon k="check" /><span>{tr('check')}</span></button>
        {primaryTabs.slice(2).map((key) => <button key={key} className={key === tab ? 'on' : ''} aria-current={key === tab ? 'page' : undefined} onClick={() => setTab(key)}><Icon k={key} /><span>{tr(key)}</span></button>)}
      </nav>
    </>
  )
}
