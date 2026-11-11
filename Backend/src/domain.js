import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { query, transaction } from './db.js'
import { allowRoles, asyncRoute, authenticate, parseBody, setAuthCookie, signToken, uuidSchema, writeAudit } from './security.js'
import { normalizePhone } from './auth.js'

const router = Router()
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  area: z.string().trim().max(120).nullable().optional(),
  expectedDeliveryDate: dateSchema.nullable().optional(),
  consent: z.literal(true).optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one field is required')
const motherRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  password: z.string().min(8).max(200),
  area: z.string().trim().max(120).optional(),
  expectedDeliveryDate: dateSchema,
  consent: z.literal(true),
})
const maternalRecordSchema = z.object({
  motherId: uuidSchema.optional(),
  recordType: z.enum(['pregnancy', 'anc', 'postnatal', 'danger_sign']),
  visitDate: dateSchema.optional(),
  gestationalWeek: z.number().int().min(0).max(45).optional(),
  notes: z.string().trim().max(4000).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})
const childSchema = z.object({
  motherId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  dateOfBirth: dateSchema,
  sex: z.enum(['female', 'male', 'unknown']).optional(),
})
const immunizationSchema = z.object({
  vaccineName: z.string().trim().min(1).max(180),
  administeredOn: dateSchema,
  batchNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(2000).optional(),
})
const statusSchema = z.object({ status: z.enum(['scheduled', 'completed', 'missed', 'cancelled']) })
const chatSchema = z.object({ message: z.string().trim().min(1).max(2000), lang: z.enum(['en', 'sw']).default('en') })
const contentSchema = z.object({
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(2).max(200),
  language: z.enum(['en', 'sw']),
  body: z.string().trim().min(10).max(10000),
  keywords: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  category: z.string().trim().min(2).max(80).default('general'),
})
const chwSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(12).max(200),
  name: z.string().trim().min(2).max(120),
  area: z.string().trim().max(120).optional(),
})
const motherAdminSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  area: z.string().trim().max(120).nullable().optional(),
  expectedDeliveryDate: dateSchema.nullable().optional(),
  assignedChwId: uuidSchema.nullable().optional(),
})
const contactSchema = z.object({ note: z.string().trim().max(1000).optional() }).default({})

const chatFallback = {
  en: 'I do not have approved information for that question. Please contact your health worker.',
  sw: 'Sina taarifa iliyoidhinishwa kuhusu swali hilo. Tafadhali wasiliana na mhudumu wako wa afya.',
}

async function phraseApprovedAnswer(message, language, approvedText) {
  if (!process.env.GROQ_API_KEY) return { answer: approvedText, provider: 'approved' }
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        temperature: 0.1,
        max_tokens: 180,
        messages: [
          {
            role: 'system',
            content: `You are Afya Toto, a maternal and child health information assistant. Rephrase the approved source in ${language === 'sw' ? 'Kiswahili' : 'English'} using plain, brief language. Use only facts in the approved source. Do not diagnose, prescribe, add treatment advice, or invent facts. If the source does not answer the question, reply exactly: ${chatFallback[language]}`,
          },
          { role: 'user', content: `Question: ${message}\n\nApproved source:\n${approvedText}` },
        ],
      }),
    })
    if (!response.ok) throw new Error(`Groq returned ${response.status}`)
    const payload = await response.json()
    const answer = payload.choices?.[0]?.message?.content?.trim()
    return { answer: answer || approvedText, provider: answer ? 'groq' : 'approved' }
  } catch (error) {
    console.error('Groq chat failed; using approved source text:', error.message)
    return { answer: approvedText, provider: 'approved' }
  }
}

async function assertMotherAccess(user, motherId) {
  if (user.role === 'admin' || (user.role === 'mother' && user.id === motherId)) return
  const result = await query(
    'SELECT 1 FROM mother_profiles WHERE user_id = $1 AND assigned_chw_id = $2',
    [motherId, user.id],
  )
  if (!result.rowCount) throw Object.assign(new Error('Mother not found'), { status: 404 })
}

function motherFilter(user, alias = 'mp') {
  if (user.role === 'mother') return { sql: `${alias}.user_id = $1`, values: [user.id] }
  if (user.role === 'chw') return { sql: `${alias}.assigned_chw_id = $1`, values: [user.id] }
  return { sql: 'TRUE', values: [] }
}

async function createAppointmentReminders(client, appointment) {
  const dueDate = appointment.due_date instanceof Date
    ? appointment.due_date.toISOString().slice(0, 10)
    : appointment.due_date
  const dueAt = new Date(`${dueDate}T09:00:00.000Z`)
  const reminders = [
    { days: 3, title: 'Upcoming appointment' },
    { days: 1, title: 'Appointment tomorrow' },
    { days: 0, title: 'Appointment today' },
  ]
  for (const reminder of reminders) {
    const scheduledFor = new Date(dueAt.getTime() - reminder.days * 86_400_000)
    if (scheduledFor <= new Date()) continue
    await client.query(
      `INSERT INTO reminders (mother_id, appointment_id, title, body, scheduled_for)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [appointment.mother_id, appointment.id, reminder.title, `${appointment.title} is due on ${appointment.due_date}.`, scheduledFor],
    )
  }
}

async function createMotherSchedule(client, motherId, edd) {
  if (!edd) return
  await client.query("DELETE FROM appointments WHERE mother_id = $1 AND appointment_type = 'anc' AND status = 'scheduled'", [motherId])
  const rules = await client.query("SELECT * FROM schedule_rules WHERE category = 'anc' AND active = TRUE")
  const delivery = new Date(`${edd}T00:00:00.000Z`)
  for (const rule of rules.rows) {
    const due = new Date(delivery.getTime() - (280 - rule.due_week * 7) * 86_400_000)
    const dueDate = due.toISOString().slice(0, 10)
    const inserted = await client.query(
      `INSERT INTO appointments (mother_id, schedule_rule_id, appointment_type, title, due_date)
       VALUES ($1, $2, 'anc', $3, $4) ON CONFLICT DO NOTHING RETURNING *`,
      [motherId, rule.id, rule.name, dueDate],
    )
    for (const appointment of inserted.rows) await createAppointmentReminders(client, appointment)
  }
}

async function createChildSchedule(client, motherId, childId, dateOfBirth) {
  const rules = await client.query("SELECT * FROM schedule_rules WHERE category IN ('pnc', 'immunization') AND active = TRUE")
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`)
  for (const rule of rules.rows) {
    const offsetDays = rule.category === 'pnc' ? rule.offset_days : rule.due_week * 7
    const due = new Date(birth.getTime() + offsetDays * 86_400_000)
    const dueDate = due.toISOString().slice(0, 10)
    const inserted = await client.query(
      `INSERT INTO appointments (mother_id, child_id, schedule_rule_id, appointment_type, title, due_date)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING *`,
      [motherId, childId, rule.id, rule.category, rule.name, dueDate],
    )
    for (const appointment of inserted.rows) await createAppointmentReminders(client, appointment)
  }
}

router.post('/auth/register', parseBody(motherRegistrationSchema), asyncRoute(async (req, res) => {
  const body = req.validatedBody
  const phone = normalizePhone(body.phone)
  const passwordHash = await bcrypt.hash(body.password, 12)
  const mother = await transaction(async (client) => {
    let account = await client.query(
      `INSERT INTO users (role, phone, password_hash) VALUES ('mother', $1, $2)
       ON CONFLICT (phone) DO NOTHING RETURNING id, role, phone`, [phone, passwordHash],
    )
    if (!account.rowCount) {
      const existing = await client.query('SELECT id, role, password_hash, phone FROM users WHERE phone=$1 FOR UPDATE', [phone])
      if (!existing.rowCount || existing.rows[0].role !== 'mother' || existing.rows[0].password_hash) {
        throw Object.assign(new Error('An account already exists for this phone. Log in instead.'), { status: 409 })
      }
      account = existing
      await client.query('UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1', [account.rows[0].id, passwordHash])
    }
    const profile = await client.query(
      `INSERT INTO mother_profiles (user_id, name, area, expected_delivery_date, consent_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name, area=EXCLUDED.area,
         expected_delivery_date=EXCLUDED.expected_delivery_date, consent_at=COALESCE(mother_profiles.consent_at, NOW()),
         updated_at=NOW()
       RETURNING name, area, expected_delivery_date AS edd`,
      [account.rows[0].id, body.name, body.area || null, body.expectedDeliveryDate],
    )
    await createMotherSchedule(client, account.rows[0].id, body.expectedDeliveryDate)
    return { ...account.rows[0], ...profile.rows[0], visits: 0, chv: null }
  })
  setAuthCookie(res, signToken(mother))
  res.status(201).json({ role: 'mother', user: mother })
}))

router.use(authenticate)

router.get('/mother/profile', allowRoles('mother'), asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT u.id, u.phone, mp.name, mp.area, mp.expected_delivery_date AS "edd",
       mp.consent_at AS "consentAt", cp.name AS chv
     FROM users u JOIN mother_profiles mp ON mp.user_id = u.id
     LEFT JOIN chw_profiles cp ON cp.user_id = mp.assigned_chw_id WHERE u.id = $1`, [req.user.id],
  )
  res.json(result.rows[0])
}))

router.patch('/mother/profile', allowRoles('mother'), parseBody(profileSchema), asyncRoute(async (req, res) => {
  const body = req.validatedBody
  const result = await transaction(async (client) => {
    const current = await client.query('SELECT consent_at FROM mother_profiles WHERE user_id = $1 FOR UPDATE', [req.user.id])
    if (!current.rowCount) throw Object.assign(new Error('Mother profile not found'), { status: 404 })
    if (!current.rows[0].consent_at && body.consent !== true) {
      throw Object.assign(new Error('Consent is required before profile setup'), { status: 400 })
    }
    const updated = await client.query(
      `UPDATE mother_profiles SET
         name = COALESCE($2, name), area = CASE WHEN $3::boolean THEN $4 ELSE area END,
         expected_delivery_date = CASE WHEN $5::boolean THEN $6::date ELSE expected_delivery_date END,
         consent_at = CASE WHEN $7 THEN COALESCE(consent_at, NOW()) ELSE consent_at END,
         updated_at = NOW()
       WHERE user_id = $1 RETURNING *`,
      [req.user.id, body.name || null, Object.hasOwn(body, 'area'), body.area || null,
        Object.hasOwn(body, 'expectedDeliveryDate'), body.expectedDeliveryDate || null, body.consent === true],
    )
    if (Object.hasOwn(body, 'expectedDeliveryDate')) {
      await createMotherSchedule(client, req.user.id, body.expectedDeliveryDate)
    }
    return updated.rows[0]
  })
  await writeAudit(req.user.id, 'profile.updated', 'mother_profile', req.user.id)
  res.json({ id: result.user_id, name: result.name, area: result.area, edd: result.expected_delivery_date, consentAt: result.consent_at })
}))

router.use(asyncRoute(async (req, _res, next) => {
  if (req.user.role === 'mother') {
    const result = await query('SELECT consent_at FROM mother_profiles WHERE user_id = $1', [req.user.id])
    if (!result.rows[0]?.consent_at) throw Object.assign(new Error('Complete consent and profile setup first'), { status: 403 })
  }
  next()
}))

router.get('/maternal-records', asyncRoute(async (req, res) => {
  const filter = motherFilter(req.user)
  const result = await query(
    `SELECT mr.*, mp.name AS mother_name, u.phone AS mother_phone FROM maternal_records mr
     JOIN mother_profiles mp ON mp.user_id = mr.mother_id JOIN users u ON u.id = mp.user_id WHERE ${filter.sql}
     ORDER BY mr.recorded_at DESC LIMIT 500`, filter.values,
  )
  res.json(result.rows)
}))

router.post('/maternal-records', allowRoles('mother', 'chw', 'admin'), parseBody(maternalRecordSchema), asyncRoute(async (req, res) => {
  const body = req.validatedBody
  const motherId = body.motherId || (req.user.role === 'mother' ? req.user.id : null)
  if (!motherId) return res.status(400).json({ error: 'motherId is required' })
  await assertMotherAccess(req.user, motherId)
  const result = await query(
    `INSERT INTO maternal_records (mother_id, record_type, visit_date, gestational_week, notes, data, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [motherId, body.recordType, body.visitDate || null, body.gestationalWeek ?? null, body.notes || null,
      JSON.stringify(body.data || {}), req.user.id],
  )
  await writeAudit(req.user.id, 'maternal_record.created', 'maternal_record', result.rows[0].id)
  res.status(201).json(result.rows[0])
}))

router.get('/children', asyncRoute(async (req, res) => {
  const filter = motherFilter(req.user)
  const result = await query(
    `SELECT c.*, mp.name AS mother_name, cp.name AS chv,
       COALESCE(json_agg(json_build_object('id', ir.id, 'vaccineName', ir.vaccine_name,
       'administeredOn', ir.administered_on)) FILTER (WHERE ir.id IS NOT NULL), '[]') AS immunizations
     FROM children c JOIN mother_profiles mp ON mp.user_id = c.mother_id
     LEFT JOIN chw_profiles cp ON cp.user_id = mp.assigned_chw_id
     LEFT JOIN immunization_records ir ON ir.child_id = c.id WHERE ${filter.sql}
    GROUP BY c.id, mp.name, cp.name ORDER BY c.date_of_birth DESC`, filter.values,
  )
  res.json(result.rows)
}))

router.post('/children', allowRoles('mother', 'chw', 'admin'), parseBody(childSchema), asyncRoute(async (req, res) => {
  const body = req.validatedBody
  const motherId = body.motherId || (req.user.role === 'mother' ? req.user.id : null)
  if (!motherId) return res.status(400).json({ error: 'motherId is required' })
  await assertMotherAccess(req.user, motherId)
  const child = await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO children (mother_id, name, date_of_birth, sex) VALUES ($1, $2, $3, $4) RETURNING *`,
      [motherId, body.name, body.dateOfBirth, body.sex || null],
    )
    await createChildSchedule(client, motherId, result.rows[0].id, body.dateOfBirth)
    return result.rows[0]
  })
  await writeAudit(req.user.id, 'child.created', 'child', child.id)
  res.status(201).json(child)
}))

router.post('/children/:childId/immunizations', allowRoles('mother', 'chw', 'admin'), parseBody(immunizationSchema), asyncRoute(async (req, res) => {
  const childId = uuidSchema.parse(req.params.childId)
  const access = await query(
    `SELECT c.id, c.mother_id FROM children c JOIN mother_profiles mp ON mp.user_id = c.mother_id
     WHERE c.id = $1 AND (${req.user.role === 'admin' ? 'TRUE' : req.user.role === 'mother' ? 'c.mother_id = $2' : 'mp.assigned_chw_id = $2'})`,
    req.user.role === 'admin' ? [childId] : [childId, req.user.id],
  )
  if (!access.rowCount) return res.status(404).json({ error: 'Child not found' })
  const body = req.validatedBody
  const record = await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO immunization_records (child_id, vaccine_name, administered_on, batch_number, notes, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [childId, body.vaccineName, body.administeredOn, body.batchNumber || null, body.notes || null, req.user.id],
    )
    await client.query(
      `UPDATE appointments SET status = 'completed', status_updated_at = NOW(), status_updated_by = $2, updated_at = NOW()
       WHERE child_id = $1 AND LOWER(title) = LOWER($3) AND status = 'scheduled'`, [childId, req.user.id, body.vaccineName],
    )
    return inserted.rows[0]
  })
  await writeAudit(req.user.id, 'immunization.recorded', 'immunization', record.id)
  res.status(201).json(record)
}))

router.get('/appointments', asyncRoute(async (req, res) => {
  const filter = motherFilter(req.user)
  const result = await query(
    `SELECT a.*, c.name AS child_name FROM appointments a
     JOIN mother_profiles mp ON mp.user_id = a.mother_id
     LEFT JOIN children c ON c.id = a.child_id WHERE ${filter.sql}
     ORDER BY a.due_date ASC LIMIT 1000`, filter.values,
  )
  res.json(result.rows)
}))

router.patch('/appointments/:appointmentId/status', allowRoles('mother', 'chw', 'admin'), parseBody(statusSchema), asyncRoute(async (req, res) => {
  const appointmentId = uuidSchema.parse(req.params.appointmentId)
  const result = await query(
    `UPDATE appointments a SET status = $3, status_updated_at = NOW(), status_updated_by = $2, updated_at = NOW()
     FROM mother_profiles mp WHERE a.id = $1 AND mp.user_id = a.mother_id
       AND ($2::uuid IS NOT NULL) AND ($4 OR mp.user_id = $2 OR mp.assigned_chw_id = $2)
     RETURNING a.*`,
    [appointmentId, req.user.id, req.validatedBody.status, req.user.role === 'admin'],
  )
  if (!result.rowCount) return res.status(404).json({ error: 'Appointment not found' })
  if (req.validatedBody.status === 'scheduled') {
    await query("UPDATE reminders SET status = 'pending' WHERE appointment_id = $1 AND status = 'cancelled' AND scheduled_for > NOW()", [appointmentId])
  } else {
    await query("UPDATE reminders SET status = 'cancelled' WHERE appointment_id = $1 AND status = 'pending'", [appointmentId])
  }
  await writeAudit(req.user.id, 'appointment.status_updated', 'appointment', appointmentId, { status: req.validatedBody.status })
  res.json(result.rows[0])
}))

router.get('/reminders', allowRoles('mother'), asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT id, appointment_id AS "appointmentId", title, body, scheduled_for AS "scheduledFor", read_at AS "readAt"
     FROM reminders WHERE mother_id = $1 AND status = 'sent' ORDER BY scheduled_for DESC LIMIT 100`, [req.user.id],
  )
  res.json(result.rows)
}))

router.patch('/reminders/:reminderId/read', allowRoles('mother'), asyncRoute(async (req, res) => {
  const id = uuidSchema.parse(req.params.reminderId)
  const result = await query(
    `UPDATE reminders SET read_at = NOW() WHERE id = $1 AND mother_id = $2 AND status = 'sent'
     RETURNING id, read_at AS "readAt"`, [id, req.user.id],
  )
  if (!result.rowCount) return res.status(404).json({ error: 'Reminder not found' })
  res.json(result.rows[0])
}))

router.get('/health-content', asyncRoute(async (req, res) => {
  const language = req.query.lang === 'sw' ? 'sw' : 'en'
  const result = await query(
    `SELECT id, slug, title, language, body, keywords, category, updated_at AS "updatedAt"
     FROM health_content WHERE approved = TRUE AND language = $1 ORDER BY category, title`, [language],
  )
  res.json(result.rows)
}))

router.post('/chat', parseBody(chatSchema), asyncRoute(async (req, res) => {
  const { message, lang } = req.validatedBody
  const lower = message.toLowerCase()
  const danger = /heavy bleeding|bleeding heavily|severe headache|fits|seizure|not breathing|difficulty breathing|reduced baby movement|baby not moving|damu nyingi|maumivu makali ya kichwa|degedege|kupumua kwa shida|mtoto\s+(hachezi|kutocheza)/i.test(lower)
  const articles = await query(
    `SELECT body, keywords, category FROM health_content WHERE approved = TRUE AND language = $1`, [lang],
  )
  const match = articles.rows
    .map((article) => ({ article, score: article.keywords.reduce((count, keyword) => count + (lower.includes(keyword.toLowerCase()) ? 1 : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.article
  const urgent = danger || match?.category === 'urgent'
  const approvedAnswer = urgent
    ? (articles.rows.find((article) => article.category === 'urgent')?.body || (lang === 'sw'
      ? 'Tafuta huduma ya dharura katika kituo cha afya sasa na uwasiliane na mhudumu wako wa afya.'
      : 'Please seek urgent care from a health facility now and contact your community health volunteer.'))
    : match?.body || chatFallback[lang]
  const generated = !urgent && match
    ? await phraseApprovedAnswer(message, lang, approvedAnswer)
    : { answer: approvedAnswer, provider: 'approved' }
  const motherId = req.user?.role === 'mother' ? req.user.id : null
  await query(
    'INSERT INTO chat_events (mother_id, language, message, answer, escalated) VALUES ($1, $2, $3, $4, $5)',
    [motherId, lang, message, generated.answer, urgent],
  )
  res.json({ answer: generated.answer, escalate: urgent, provider: generated.provider })
}))

router.get('/chw/dashboard', allowRoles('chw', 'admin'), asyncRoute(async (req, res) => {
  const assignedClause = req.user.role === 'chw' ? 'mp.assigned_chw_id = $1' : 'TRUE'
  const values = req.user.role === 'chw' ? [req.user.id] : []
  const [mothers, overdue, vaccineDue, urgent] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM mother_profiles mp WHERE ${assignedClause}`, values),
    query(`SELECT COUNT(*)::int AS count FROM appointments a JOIN mother_profiles mp ON mp.user_id = a.mother_id
      WHERE ${assignedClause} AND a.appointment_type = 'anc' AND a.status = 'scheduled' AND a.due_date < CURRENT_DATE`, values),
    query(`SELECT COUNT(DISTINCT c.id)::int AS count FROM children c JOIN mother_profiles mp ON mp.user_id = c.mother_id
      JOIN appointments a ON a.child_id = c.id WHERE ${assignedClause} AND a.appointment_type = 'immunization'
      AND a.status = 'scheduled' AND a.due_date < CURRENT_DATE`, values),
    query(`SELECT COUNT(*)::int AS count FROM maternal_records mr JOIN mother_profiles mp ON mp.user_id = mr.mother_id
      WHERE ${assignedClause} AND mr.record_type = 'danger_sign' AND mr.recorded_at > NOW() - INTERVAL '30 days'`, values),
  ])
  res.json({ mothers: mothers.rows[0].count, overdueAnc: overdue.rows[0].count, childrenBehind: vaccineDue.rows[0].count, dangerAlerts: urgent.rows[0].count })
}))

router.get('/chw/mothers', allowRoles('chw', 'admin'), asyncRoute(async (req, res) => {
  const filter = req.user.role === 'chw' ? 'WHERE mp.assigned_chw_id = $1' : ''
  const values = req.user.role === 'chw' ? [req.user.id] : []
  const result = await query(
    `SELECT u.id, mp.name, u.phone, mp.area, mp.expected_delivery_date AS edd,
       cp.name AS chv,
       (SELECT COUNT(*)::int FROM appointments a WHERE a.mother_id = mp.user_id
         AND a.appointment_type = 'anc' AND a.status = 'completed') AS visits,
       (SELECT json_build_object('id', a.id, 'title', a.title, 'dueDate', a.due_date, 'status', a.status)
        FROM appointments a WHERE a.mother_id = mp.user_id AND a.appointment_type = 'anc'
          AND a.status = 'scheduled' ORDER BY a.due_date LIMIT 1) AS next_anc
     FROM mother_profiles mp JOIN users u ON u.id = mp.user_id
     LEFT JOIN chw_profiles cp ON cp.user_id = mp.assigned_chw_id ${filter}
     ORDER BY mp.name`, values,
  )
  res.json(result.rows)
}))

router.get('/chw/contacts', allowRoles('chw', 'admin'), asyncRoute(async (req, res) => {
  const filter = req.user.role === 'chw' ? 'WHERE mp.assigned_chw_id = $1' : ''
  const values = req.user.role === 'chw' ? [req.user.id] : []
  const result = await query(
    `SELECT fc.id, fc.appointment_id AS "appointmentId", fc.mother_id AS "motherId",
       fc.contacted_at AS "contactedAt", fc.note, a.title AS "appointmentTitle"
     FROM follow_up_contacts fc JOIN mother_profiles mp ON mp.user_id=fc.mother_id
     LEFT JOIN appointments a ON a.id=fc.appointment_id ${filter}
     ORDER BY fc.contacted_at DESC LIMIT 500`, values,
  )
  res.json(result.rows)
}))

router.post('/chw/appointments/:appointmentId/contact', allowRoles('chw', 'admin'), parseBody(contactSchema), asyncRoute(async (req, res) => {
  const appointmentId = uuidSchema.parse(req.params.appointmentId)
  const where = req.user.role === 'admin' ? 'TRUE' : 'mp.assigned_chw_id = $2'
  const values = req.user.role === 'admin' ? [appointmentId] : [appointmentId, req.user.id]
  const appointment = await query(
    `SELECT a.id, a.mother_id, a.status FROM appointments a
     JOIN mother_profiles mp ON mp.user_id=a.mother_id
     WHERE a.id=$1 AND ${where}`, values,
  )
  if (!appointment.rowCount) return res.status(404).json({ error: 'Appointment not found' })
  if (appointment.rows[0].status === 'cancelled') return res.status(409).json({ error: 'Cancelled appointments cannot be contacted' })
  const result = await query(
    `INSERT INTO follow_up_contacts (appointment_id, mother_id, contacted_by, note)
     VALUES ($1, $2, $3, $4) RETURNING id, appointment_id AS "appointmentId",
       mother_id AS "motherId", contacted_at AS "contactedAt", note`,
    [appointmentId, appointment.rows[0].mother_id, req.user.id, req.validatedBody.note || null],
  )
  await writeAudit(req.user.id, 'follow_up.contacted', 'appointment', appointmentId)
  res.status(201).json(result.rows[0])
}))

router.get('/admin/health-content', allowRoles('admin'), asyncRoute(async (_req, res) => {
  const result = await query('SELECT * FROM health_content ORDER BY language, category, title')
  res.json(result.rows)
}))

router.get('/admin/mothers', allowRoles('admin'), asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT u.id, u.phone, mp.name, mp.area, mp.expected_delivery_date AS edd,
       mp.consent_at AS "consentAt", cp.name AS chv, mp.assigned_chw_id AS "assignedChwId"
     FROM users u JOIN mother_profiles mp ON mp.user_id = u.id
     LEFT JOIN chw_profiles cp ON cp.user_id = mp.assigned_chw_id ORDER BY mp.created_at DESC`,
  )
  res.json(result.rows)
}))

router.patch('/admin/mothers/:motherId', allowRoles('admin'), parseBody(motherAdminSchema), asyncRoute(async (req, res) => {
  const motherId = uuidSchema.parse(req.params.motherId)
  const body = req.validatedBody
  if (body.assignedChwId) {
    const chw = await query("SELECT 1 FROM users WHERE id = $1 AND role = 'chw' AND active = TRUE", [body.assignedChwId])
    if (!chw.rowCount) return res.status(400).json({ error: 'Assigned CHV account was not found' })
  }
  const updated = await transaction(async (client) => {
    const result = await client.query(
      `UPDATE mother_profiles SET name=COALESCE($2, name),
         area=CASE WHEN $3::boolean THEN $4 ELSE area END,
         expected_delivery_date=CASE WHEN $5::boolean THEN $6::date ELSE expected_delivery_date END,
         assigned_chw_id=CASE WHEN $7::boolean THEN $8::uuid ELSE assigned_chw_id END,
         updated_at=NOW() WHERE user_id=$1 RETURNING *`,
      [motherId, body.name || null, Object.hasOwn(body, 'area'), body.area || null,
        Object.hasOwn(body, 'expectedDeliveryDate'), body.expectedDeliveryDate || null,
        Object.hasOwn(body, 'assignedChwId'), body.assignedChwId || null],
    )
    if (result.rowCount && Object.hasOwn(body, 'expectedDeliveryDate')) {
      await createMotherSchedule(client, motherId, body.expectedDeliveryDate)
    }
    return result
  })
  if (!updated.rowCount) return res.status(404).json({ error: 'Mother not found' })
  await writeAudit(req.user.id, 'mother.assigned_or_updated', 'mother_profile', motherId, { fields: Object.keys(body) })
  res.json(updated.rows[0])
}))

router.get('/admin/chws', allowRoles('admin'), asyncRoute(async (_req, res) => {
  const result = await query(
    `SELECT u.id, u.username, cp.name, cp.area, u.active,
       (SELECT COUNT(*)::int FROM mother_profiles mp WHERE mp.assigned_chw_id=u.id) AS assigned_mothers
     FROM users u JOIN chw_profiles cp ON cp.user_id=u.id ORDER BY cp.name`,
  )
  res.json(result.rows)
}))

router.post('/admin/chws', allowRoles('admin'), parseBody(chwSchema), asyncRoute(async (req, res) => {
  const { username, password, name, area } = req.validatedBody
  const passwordHash = await bcrypt.hash(password, 12)
  const created = await transaction(async (client) => {
    const account = await client.query(
      `INSERT INTO users (role, username, password_hash) VALUES ('chw', $1, $2) RETURNING id, username`,
      [username, passwordHash],
    )
    await client.query('INSERT INTO chw_profiles (user_id, name, area) VALUES ($1, $2, $3)', [account.rows[0].id, name, area || null])
    return account.rows[0]
  })
  await writeAudit(req.user.id, 'chw.created', 'user', created.id)
  res.status(201).json({ ...created, name, area: area || null })
}))

router.post('/admin/health-content', allowRoles('admin'), parseBody(contentSchema), asyncRoute(async (req, res) => {
  const { slug, title, language, body, keywords, category } = req.validatedBody
  const result = await query(
    `INSERT INTO health_content (slug, title, language, body, keywords, category)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, [slug, title, language, body, keywords, category],
  )
  await writeAudit(req.user.id, 'health_content.created', 'health_content', result.rows[0].id)
  res.status(201).json(result.rows[0])
}))

router.patch('/admin/health-content/:contentId', allowRoles('admin'), parseBody(contentSchema.partial()), asyncRoute(async (req, res) => {
  const id = uuidSchema.parse(req.params.contentId)
  const fields = req.validatedBody
  if (!Object.keys(fields).length) return res.status(400).json({ error: 'At least one field is required' })
  const current = await query('SELECT * FROM health_content WHERE id = $1', [id])
  if (!current.rowCount) return res.status(404).json({ error: 'Content not found' })
  const item = { ...current.rows[0], ...fields }
  const updated = await query(
    `UPDATE health_content SET slug=$2, title=$3, language=$4, body=$5, keywords=$6, category=$7,
       approved=FALSE, reviewed_by=NULL, reviewed_at=NULL, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, item.slug, item.title, item.language, item.body, item.keywords, item.category],
  )
  await writeAudit(req.user.id, 'health_content.updated', 'health_content', id)
  res.json(updated.rows[0])
}))

router.patch('/admin/health-content/:contentId/review', allowRoles('admin'), parseBody(z.object({ approved: z.boolean() })), asyncRoute(async (req, res) => {
  const id = uuidSchema.parse(req.params.contentId)
  const result = await query(
    `UPDATE health_content SET approved=$2, reviewed_by=$3, reviewed_at=NOW(), updated_at=NOW()
     WHERE id=$1 RETURNING *`, [id, req.validatedBody.approved, req.user.id],
  )
  if (!result.rowCount) return res.status(404).json({ error: 'Content not found' })
  await writeAudit(req.user.id, 'health_content.reviewed', 'health_content', id, { approved: req.validatedBody.approved })
  res.json(result.rows[0])
}))

router.get('/admin/schedule-rules', allowRoles('admin'), asyncRoute(async (_req, res) => {
  const result = await query('SELECT * FROM schedule_rules ORDER BY category, due_week')
  res.json(result.rows)
}))

router.patch('/admin/schedule-rules/:ruleId', allowRoles('admin'), parseBody(z.object({
  dueWeek: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
})), asyncRoute(async (req, res) => {
  const id = uuidSchema.parse(req.params.ruleId)
  const result = await query(
    `UPDATE schedule_rules SET due_week=COALESCE($2, due_week), active=COALESCE($3, active),
       updated_by=$4, updated_at=NOW() WHERE id=$1 RETURNING *`,
    [id, req.validatedBody.dueWeek ?? null, req.validatedBody.active ?? null, req.user.id],
  )
  if (!result.rowCount) return res.status(404).json({ error: 'Schedule rule not found' })
  await writeAudit(req.user.id, 'schedule_rule.updated', 'schedule_rule', id, req.validatedBody)
  res.json(result.rows[0])
}))

export default router