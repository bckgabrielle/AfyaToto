import { ANC, children, mothers, VACCINES } from './data'
import { DANGER, FAQ, FALLBACK, ESCALATE } from './content'

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
export const MOCK = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'

export const dateOnly = (value) => {
  if (!value) return null
  if (value instanceof Date) return value
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
}
export const asDateString = (value) => {
  const date = dateOnly(value)
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : null
}
export const hydrate = (user) => (user?.edd ? { ...user, edd: dateOnly(user.edd) } : user)
const later = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 120))

async function req(path, { method = 'GET', body } = {}) {
  if (!BASE) throw new Error('Backend URL is not configured. Set VITE_API_URL or enable local demo mode.')
  let response
  try {
    response = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('Could not reach Afya Toto. Check your connection and try again.')
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || 'Request failed. Please try again.')
  return payload
}

const toAppointment = (item) => ({
  id: item.id,
  motherId: item.mother_id ?? item.motherId,
  childId: item.child_id ?? item.childId,
  childName: item.child_name ?? item.childName,
  type: item.appointment_type ?? item.type,
  title: item.title,
  dueDate: dateOnly(item.due_date ?? item.dueDate),
  status: item.status,
})
const readDemo = (key, fallback = null) => {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
let demoAppointments = null
let demoChildren = null
let demoContacts = []

function demoSchedules() {
  const anc = mothers.flatMap((mother) => {
    const edd = dateOnly(mother.edd)
    const lmp = new Date(edd.getTime() - 280 * 86_400_000)
    return ANC.map((week, index) => ({
      id: `anc-${mother.id}-${index + 1}`, motherId: String(mother.id), childId: null,
      type: 'anc', title: `ANC contact ${index + 1}`,
      dueDate: new Date(lmp.getTime() + week * 7 * 86_400_000),
      status: index < mother.visits ? 'completed' : 'scheduled',
    }))
  })
  const vaccines = children.flatMap((child) => VACCINES.map((vaccine) => ({
    id: `vaccine-${child.id}-${vaccine.wk}`, motherId: 'demo-1', childId: String(child.id),
    type: 'immunization', title: vaccine.name,
    dueDate: new Date(dateOnly(child.dob).getTime() + vaccine.wk * 7 * 86_400_000),
    status: child.given.includes(vaccine.name) ? 'completed' : 'scheduled',
  })))
  return [...anc, ...vaccines]
}

function demoChildList() {
  if (demoChildren) return demoChildren
  return children.map((child) => ({
    id: String(child.id), motherId: '', motherName: child.name, chv: child.chv,
    name: child.name, dateOfBirth: child.dob,
    immunizations: child.given.map((vaccineName) => ({ vaccineName, administeredOn: child.dob })),
  }))
}

export const api = {
  async registerMother(details) {
    if (MOCK) {
      const accounts = readDemo('at_demo_mothers', [])
      const digits = details.phone.replace(/\D/g, '').slice(-9)
      if (accounts.some((account) => account.phone.replace(/\D/g, '').slice(-9) === digits)) throw new Error('An account already exists for this phone. Log in instead.')
      const user = { id: `demo-mother-${Date.now()}`, name: details.name, phone: details.phone, area: details.area || null, edd: dateOnly(details.expectedDeliveryDate), visits: 0, chv: null }
      const profile = { ...user, consentAt: new Date().toISOString() }
      sessionStorage.setItem('at_demo_mothers', JSON.stringify([...accounts, { phone: details.phone, password: details.password, user, profile }]))
      sessionStorage.setItem('at_demo_profile', JSON.stringify(profile))
      return later({ role: 'mother', user })
    }
    const result = await req('/api/auth/register', { method: 'POST', body: details })
    return { ...result, user: hydrate(result.user) }
  },

  async loginMother(phone, password) {
    if (MOCK) {
      const digits = phone.replace(/\D/g, '').slice(-9)
      const account = readDemo('at_demo_mothers', []).find((item) => item.phone.replace(/\D/g, '').slice(-9) === digits && item.password === password)
      if (!account) throw new Error('Invalid phone number or password')
      sessionStorage.setItem('at_demo_profile', JSON.stringify(account.profile))
      return later({ role: 'mother', user: hydrate(account.user) })
    }
    const result = await req('/api/auth/login', { method: 'POST', body: { phone, password } })
    return { ...result, user: hydrate(result.user) }
  },

  async login(username, password) {
    if (MOCK) {
      const role = username === 'admin' && password === 'admin123' ? 'admin' : 'chw'
      if (role === 'admin' || (username === 'chw' && password === 'chw123')) return later({ role, user: { id: `demo-${role}`, name: role === 'admin' ? 'Demo Administrator' : 'CHV Grace' } })
      throw new Error('Invalid username or password')
    }
    return req('/api/auth/login', { method: 'POST', body: { username, password } })
  },

  async me() {
    if (MOCK) return readDemo('at_demo_session')
    const result = await req('/api/auth/me')
    return { ...result, user: hydrate(result.user) }
  },

  async logout() {
    if (MOCK) {
      for (const key of ['at_demo_session', 'at_demo_profile', 'at_demo_mothers']) sessionStorage.removeItem(key)
      return
    }
    await req('/api/auth/logout', { method: 'POST' })
  },

  async getProfile() {
    if (MOCK) return readDemo('at_demo_profile', { ...mothers[0], edd: dateOnly(mothers[0].edd), consentAt: 'demo' })
    return hydrate(await req('/api/mother/profile'))
  },

  async updateProfile(profile) {
    if (MOCK) {
      const result = { ...profile, edd: dateOnly(profile.expectedDeliveryDate), consentAt: new Date().toISOString() }
      sessionStorage.setItem('at_demo_profile', JSON.stringify(result))
      return result
    }
    return hydrate(await req('/api/mother/profile', { method: 'PATCH', body: profile }))
  },

  async getAppointments() {
    if (MOCK) return (demoAppointments || demoSchedules()).map(toAppointment)
    return (await req('/api/appointments')).map(toAppointment)
  },

  async updateAppointmentStatus(id, status) {
    if (MOCK) {
      demoAppointments = (demoAppointments || demoSchedules()).map((item) => item.id === id ? { ...item, status } : item)
      return toAppointment(demoAppointments.find((item) => item.id === id))
    }
    return toAppointment(await req(`/api/appointments/${id}/status`, { method: 'PATCH', body: { status } }))
  },

  async getMaternalRecords() {
    if (MOCK) return mothers.filter((mother) => mother.danger).map((mother) => ({ id: `danger-${mother.id}`, mother_id: String(mother.id), mother_name: mother.name, mother_phone: mother.phone, record_type: 'danger_sign', notes: mother.danger, recorded_at: new Date().toISOString() }))
    return req('/api/maternal-records')
  },

  async addMaternalRecord(record) {
    if (MOCK) return later({ ...record, id: `demo-record-${Date.now()}`, recorded_at: new Date().toISOString() })
    return req('/api/maternal-records', { method: 'POST', body: record })
  },

  async getChildren() {
    if (MOCK) return demoChildList()
    return (await req('/api/children')).map((child) => ({ id: child.id, motherId: child.mother_id, motherName: child.mother_name, chv: child.chv, name: child.name, dateOfBirth: dateOnly(child.date_of_birth), immunizations: child.immunizations || [] }))
  },

  async addChild(child) {
    if (MOCK) {
      const saved = { ...child, id: `demo-child-${Date.now()}`, dateOfBirth: dateOnly(child.dateOfBirth), immunizations: [] }
      demoChildren = [...demoChildList(), saved]
      return later(saved)
    }
    return req('/api/children', { method: 'POST', body: child })
  },

  async recordImmunization(childId, record) {
    if (MOCK) {
      demoChildren = demoChildList().map((child) => child.id === childId ? { ...child, immunizations: [...child.immunizations, { ...record, id: `demo-vaccine-${Date.now()}` }] } : child)
      demoAppointments = (demoAppointments || demoSchedules()).map((item) => String(item.childId) === String(childId) && item.title === record.vaccineName ? { ...item, status: 'completed' } : item)
      return later({ ...record, childId })
    }
    return req(`/api/children/${childId}/immunizations`, { method: 'POST', body: record })
  },

  async getReminders() {
    if (MOCK) return []
    return req('/api/reminders')
  },

  async getHealthContent(lang) {
    if (MOCK) return FAQ.map((article, index) => ({ id: `demo-article-${index}`, title: ['Clinic visits', 'Iron and folic acid', 'Everyday nutrition', 'Breastfeeding', 'Child vaccines'][index], body: article[lang], category: 'general' }))
    return req(`/api/health-content?lang=${lang}`)
  },

  async chat(message, lang) {
    if (!MOCK) return req('/api/chat', { method: 'POST', body: { message, lang } })
    if (DANGER.test(message)) return later({ answer: ESCALATE[lang], escalate: true, provider: 'approved' })
    const article = FAQ.find((item) => item.k.test(message))
    return later({ answer: article ? article[lang] : FALLBACK[lang], escalate: false, provider: 'approved' })
  },

  async getChwDashboard() {
    if (MOCK) return { mothers: mothers.length, overdueAnc: 2, childrenBehind: 2, dangerAlerts: 1 }
    return req('/api/chw/dashboard')
  },

  async getChwMothers() {
    if (MOCK) return mothers.map((mother) => ({ ...mother, id: String(mother.id), edd: dateOnly(mother.edd) }))
    return req('/api/chw/mothers')
  },

  async getFollowUpContacts() {
    if (MOCK) return []
    return req('/api/chw/contacts')
  },

  async markAppointmentContacted(id) {
    if (MOCK) return later({ appointmentId: id, contactedAt: new Date().toISOString() })
    return req(`/api/chw/appointments/${id}/contact`, { method: 'POST', body: {} })
  },
}