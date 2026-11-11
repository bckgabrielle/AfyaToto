import React, { useEffect, useState } from 'react'
import { mothers as demoMothers, ANC } from './data'
import { fmt, gest, status, Badge } from './util.jsx'
import { api, asDateString, dateOnly } from './api'

const Stat = ({ label, value, tone }) => <div className={'card stat ' + (tone || '')}><b>{value}</b><span>{label}</span></div>

function appointmentStatus(item) {
  if (item.status === 'completed') return 'Completed'
  if (item.status === 'missed') return 'Missed'
  if (item.status === 'cancelled') return 'Cancelled'
  return status(item.dueDate)
}

function Dashboard({ summary, mothers, appointments, contacts, records, onContact, busyId }) {
  const contacted = new Set(contacts.map((item) => item.appointmentId))
  const cutoff = new Date(Date.now() + 7 * 86_400_000)
  const rows = appointments
    .filter((item) => item.type === 'anc' && item.status === 'scheduled' && item.dueDate <= cutoff)
    .sort((a, b) => a.dueDate - b.dueDate)
  const motherById = new Map(mothers.map((mother) => [String(mother.id), mother]))
  const urgent = records.filter((item) => item.record_type === 'danger_sign').slice(0, 10)
  return (
    <>
      <div className="stats">
        <Stat label="Mothers enrolled" value={summary?.mothers ?? mothers.length} />
        <Stat label="Overdue ANC visits" value={summary?.overdueAnc ?? 0} tone="red" />
        <Stat label="Children behind on vaccines" value={summary?.childrenBehind ?? 0} tone="amber" />
        <Stat label="Danger-sign alerts" value={summary?.dangerAlerts ?? urgent.length} tone="red" />
      </div>
      {urgent.map((record) => (
        <div key={record.id} className="alert">
          <b>Reported danger sign:</b> {record.mother_name} ({record.notes})
          {record.mother_phone && <a href={'tel:' + record.mother_phone.replace(/\s/g, '')}>Call {record.mother_phone}</a>}
          <small>{fmt(new Date(record.recorded_at))}</small>
        </div>
      ))}
      <div className="card">
        <h3>Follow-up list: ANC due or overdue</h3>
        {rows.length ? <div className="scroll"><table>
          <thead><tr><th>Mother</th><th>Area</th><th>Appointment</th><th>Due</th><th>Status</th><th>CHV</th><th></th></tr></thead>
          <tbody>{rows.map((item) => {
            const mother = motherById.get(String(item.motherId))
            const done = contacted.has(item.id)
            return <tr key={item.id}>
              <td>{mother?.name || 'Mother'}</td><td>{mother?.area || '—'}</td><td>{item.title}</td><td>{fmt(item.dueDate)}</td>
              <td><Badge s={done ? 'Contacted' : appointmentStatus(item)} /></td><td>{mother?.chv || '—'}</td>
              <td><button disabled={done || busyId === item.id} onClick={() => onContact(item.id)}>{done ? 'Contacted' : busyId === item.id ? 'Saving…' : 'Mark contacted'}</button></td>
            </tr>
          })}</tbody>
        </table></div> : <p className="muted">No ANC appointments due this week.</p>}
      </div>
    </>
  )
}

function Mothers({ mothers, appointments, records, onStatus, busyId }) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(mothers[0]?.id || '')
  const list = mothers.filter((mother) => `${mother.name || ''} ${mother.area || ''}`.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => {
    if (!list.some((item) => item.id === selectedId)) setSelectedId(list[0]?.id || '')
  }, [list, selectedId])
  const selected = list.find((item) => item.id === selectedId)
  if (!selected) return <div className="card"><input placeholder="Search by name or area" value={query} onChange={(event) => setQuery(event.target.value)} /><p className="muted">No mothers found.</p></div>
  const visits = appointments.filter((item) => String(item.motherId) === String(selected.id) && item.type === 'anc').sort((a, b) => a.dueDate - b.dueDate)
  const alerts = records.filter((item) => String(item.mother_id) === String(selected.id) && item.record_type === 'danger_sign')
  return (
    <div className="split">
      <div className="card">
        <label className="sr-only" htmlFor="mother-search">Search mothers by name or area</label><input id="mother-search" placeholder="Search by name or area" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="scroll"><table><thead><tr><th>Name</th><th>Area</th><th>Weeks</th><th>Next ANC</th></tr></thead>
          <tbody>{list.map((mother) => {
            const next = appointments.filter((item) => String(item.motherId) === String(mother.id) && item.type === 'anc' && item.status === 'scheduled').sort((a, b) => a.dueDate - b.dueDate)[0]
            return <tr key={mother.id} tabIndex={0} aria-selected={selected.id === mother.id} className={'click ' + (selected.id === mother.id ? 'on' : '')} onClick={() => setSelectedId(mother.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(mother.id) } }}>
              <td>{mother.name}</td><td>{mother.area || '—'}</td><td>{mother.edd ? gest({ edd: dateOnly(mother.edd) }) : '—'}</td><td>{next ? fmt(next.dueDate) : '—'}</td>
            </tr>
          })}</tbody>
        </table></div>
      </div>
      <div className="card">
        <h3>{selected.name}</h3>
        <p className="muted">{selected.phone} · {selected.area || '—'} · CHV {selected.chv || 'Unassigned'}<br />Expected delivery {fmt(dateOnly(selected.edd))}</p>
        {alerts.map((record) => <div key={record.id} className="alert">{record.notes}<small>{fmt(new Date(record.recorded_at))}</small></div>)}
        <h4>ANC appointments</h4>
        <div className="chips col">{visits.map((item) => <div key={item.id} className="row">
          <span className={'chip ' + (item.status === 'completed' ? 'done' : item.status === 'missed' ? 'late' : '')}>{item.title} · {fmt(item.dueDate)} · {item.status}</span>
          {item.status === 'scheduled' && <button disabled={busyId === item.id} onClick={() => onStatus(item.id, 'completed')}>{busyId === item.id ? 'Saving…' : 'Mark attended'}</button>}
        </div>)}</div>
        {!visits.length && <p className="muted">No ANC appointments recorded.</p>}
        <div className="chips">{ANC.map((week) => <span key={week} className="chip">Week {week}</span>)}</div>
      </div>
    </div>
  )
}

function Children({ children, appointments, onRecordDose, onStatus, busyId }) {
  if (!children.length) return <div className="card"><p className="muted">No children are registered for this account.</p></div>
  return <div className="grid">{children.map((child) => {
    const age = child.dateOfBirth ? Math.floor((Date.now() - dateOnly(child.dateOfBirth).getTime()) / (7 * 86_400_000)) : 0
    const schedule = appointments.filter((item) => String(item.childId) === String(child.id)).sort((a, b) => a.dueDate - b.dueDate)
    return <div key={child.id} className="card">
      <h3>{child.name}</h3>
      <p className="muted">{age} weeks old · born {fmt(dateOnly(child.dateOfBirth))} · Mother {child.motherName || '—'} · CHV {child.chv || '—'}</p>
      <div className="chips col">{schedule.map((item) => <div className="row" key={item.id}>
        <span className={'chip ' + (item.status === 'completed' ? 'done' : item.dueDate < new Date() ? 'late' : '')}>{item.title} · {fmt(item.dueDate)} · {item.status}</span>
        {item.status === 'scheduled' && (item.type === 'immunization'
          ? <button disabled={busyId === item.id} onClick={() => onRecordDose(child.id, item)}>{busyId === item.id ? 'Saving…' : 'Record dose'}</button>
          : <button disabled={busyId === item.id} onClick={() => onStatus(item.id, 'completed')}>{busyId === item.id ? 'Saving…' : 'Mark complete'}</button>)}
      </div>)}</div>
      {!schedule.length && <p className="muted">No appointments recorded.</p>}
    </div>
  })}</div>
}

function Simulator() {
  const m = demoMothers[0]
  const n = nextAnc(m)
  const home = 'CON Afya Toto\n1. My next clinic visit\n2. I attended my visit\n3. Request a CHV call\n4. Danger signs'
  const [log, setLog] = useState([{ from: 'sys', t: home }])
  const [v, setV] = useState('')
  const reply = (x) =>
    ({
      1: `END Hello ${m.name.split(' ')[0]}. Your next ANC visit is contact ${m.visits + 1} (week ${n.wk}) on ${fmt(n.due)}.`,
      2: 'END Thank you. Your visit has been recorded.',
      3: `END A community health volunteer (${m.chv}) will call you within 24 hours.`,
      4: 'CON Do you have any of these?\n1. Heavy bleeding\n2. Severe headache\n3. Baby not moving\n4. Fits',
    }[x] || (log.length > 2 ? 'END Please go to the nearest health facility now. A CHV has been alerted.' : 'END Invalid choice.'))
  const send = () => {
    if (!v) return
    setLog([...log, { from: 'me', t: v }, { from: 'sys', t: reply(v) }])
    setV('')
  }
  return (
    <div className="card phone">
      <h3>USSD (*384#)</h3>
      <p className="muted">Simulates what a mother on a basic phone sees. Demo only.</p>
      <div className="screen">{log.map((l, i) => <pre key={i} className={l.from}>{l.t.replace(/^(CON|END) /, '')}</pre>)}</div>
      <div className="row">
      <input aria-label="USSD response" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Type 1-4" />
        <button onClick={send}>Send</button>
        <button className="ghost" onClick={() => setLog([{ from: 'sys', t: home }])}>Reset</button>
      </div>
    </div>
  )
}

const pages = { Dashboard, Mothers, Children, 'USSD': Simulator }

export default function Chw({ onLogout, role = 'chw' }) {
  const [page, setPage] = useState('Dashboard')
  const [summary, setSummary] = useState(null)
  const [mothers, setMothers] = useState([])
  const [children, setChildren] = useState([])
  const [appointments, setAppointments] = useState([])
  const [records, setRecords] = useState([])
  const [contacts, setContacts] = useState([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function reload() {
    const results = await Promise.allSettled([
      api.getChwDashboard(), api.getChwMothers(), api.getChildren(),
      api.getAppointments(), api.getMaternalRecords(), api.getFollowUpContacts(),
    ])
    setSummary(results[0].status === 'fulfilled' ? results[0].value : null)
    setMothers(results[1].status === 'fulfilled' ? results[1].value : [])
    setChildren(results[2].status === 'fulfilled' ? results[2].value : [])
    setAppointments(results[3].status === 'fulfilled' ? results[3].value : [])
    setRecords(results[4].status === 'fulfilled' ? results[4].value : [])
    setContacts(results[5].status === 'fulfilled' ? results[5].value : [])
    const failure = results.find((result) => result.status === 'rejected')
    setError(failure?.reason?.message || '')
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  async function perform(id, action) {
    setBusyId(id)
    setError('')
    try { await action(); await reload() } catch (issue) { setError(issue.message) } finally { setBusyId('') }
  }

  async function recordDose(childId, item) {
    await perform(item.id, () => api.recordImmunization(childId, {
      vaccineName: item.title,
      administeredOn: asDateString(new Date()),
    }))
  }

  const pages = {
    Dashboard: <Dashboard summary={summary} mothers={mothers} appointments={appointments} contacts={contacts} records={records} onContact={(id) => perform(id, () => api.markAppointmentContacted(id))} busyId={busyId} />,
    Mothers: <Mothers mothers={mothers} appointments={appointments} records={records} onStatus={(id, value) => perform(id, () => api.updateAppointmentStatus(id, value))} busyId={busyId} />,
    Children: <Children children={children} appointments={appointments} onRecordDose={recordDose} onStatus={(id, value) => perform(id, () => api.updateAppointmentStatus(id, value))} busyId={busyId} />,
    USSD: <Simulator />,
  }
  const Page = pages[page]
  return (
    <div className="app">
      <a className="skip-link" href="#chw-main">Skip to content</a>
      <aside>
        <h1>Afya Toto</h1>
        <p>{role === 'admin' ? 'Administrator' : 'Mother & child health follow-up'}</p>
        {Object.keys(pages).map((p) => (
          <button key={p} aria-current={p === page ? 'page' : undefined} className={'nav ' + (p === page ? 'on' : '')} onClick={() => setPage(p)}>{p}</button>
        ))}
        <button className="nav" onClick={onLogout}>Log out</button>
      </aside>
      <main id="chw-main" tabIndex={-1}>
        <h2>{page}</h2>
        {error && <div className="alert" role="alert">{error}</div>}
        {loading ? <p className="muted">Loading records…</p> : Page}
      </main>
    </div>
  )
}
