import React from 'react'
import { ANC, VACCINES } from './data'

export const DAY = 86_400_000

export function asDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function fmt(value) {
  const date = asDate(value)
  return date ? date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function lmp(mother) {
  const edd = asDate(mother?.edd)
  return edd ? edd.getTime() - 280 * DAY : null
}

export function gest(mother) {
  const start = lmp(mother)
  return start === null ? null : Math.max(0, Math.floor((Date.now() - start) / (7 * DAY)))
}

export function nextAnc(mother) {
  const start = lmp(mother)
  if (start === null || mother.visits >= ANC.length) return null
  return { wk: ANC[mother.visits], due: new Date(start + ANC[mother.visits] * 7 * DAY) }
}

export function status(value) {
  const date = asDate(value)
  if (!date) return 'Unknown'
  return date < Date.now() ? 'Overdue' : date.getTime() - Date.now() <= 7 * DAY ? 'Due soon' : 'On track'
}

const colors = { Overdue: 'red', 'Due soon': 'amber', 'On track': 'green', Contacted: 'blue', Completed: 'green', Missed: 'red', Cancelled: 'blue', Unknown: 'blue' }
export function Badge({ s }) {
  return <span className={`badge ${colors[s] || 'blue'}`}>{s}</span>
}

export function ageWk(child) {
  const dob = asDate(child?.dob || child?.dateOfBirth)
  return dob ? Math.max(0, Math.floor((Date.now() - dob.getTime()) / (7 * DAY))) : 0
}

export function missed(child) {
  return VACCINES.filter((vaccine) => vaccine.wk <= ageWk(child) && !(child.given || []).includes(vaccine.name))
}
