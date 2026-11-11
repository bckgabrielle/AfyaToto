import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

async function seedAccount(username, password, role, name) {
  if (!password) return
  const passwordHash = await bcrypt.hash(password, 12)
  const result = await pool.query(
    `INSERT INTO users (role, username, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, active=TRUE, updated_at=NOW()
     RETURNING id`, [role, username, passwordHash],
  )
  if (role === 'chw') {
    await pool.query(
      `INSERT INTO chw_profiles (user_id, name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name`, [result.rows[0].id, name],
    )
  }
}

try {
  await seedAccount(process.env.SEED_CHW_USERNAME || 'chw', process.env.SEED_CHW_PASSWORD, 'chw', 'Afya Toto CHV')
  await seedAccount(process.env.SEED_ADMIN_USERNAME || 'admin', process.env.SEED_ADMIN_PASSWORD, 'admin', 'Afya Toto Administrator')

  const schedules = [
    ...[12, 20, 26, 30, 34, 36, 38, 40].map((week, index) => ({ category: 'anc', name: `ANC contact ${index + 1}`, week, days: 0 })),
    ...[
      ['BCG + Polio 0', 0],
      ['Penta, PCV, Polio, Rota (dose 1)', 6],
      ['Penta, PCV, Polio, Rota (dose 2)', 10],
      ['Penta, PCV, Polio, Rota, IPV (dose 3)', 14],
      ['Measles-Rubella 1 (9 months)', 39],
      ['Measles-Rubella 2 (18 months)', 78],
    ].map(([name, week]) => ({ category: 'immunization', name, week, days: 0 })),
    ...[
      ['Postnatal check (48 hours)', 2],
      ['Postnatal check (1-2 weeks)', 10],
      ['Postnatal check (6 weeks)', 42],
      ['Postnatal check (4-6 months)', 150],
    ].map(([name, days]) => ({ category: 'pnc', name, week: 0, days })),
  ]
  for (const item of schedules) {
    await pool.query(
      `INSERT INTO schedule_rules (category, name, due_week, offset_days) VALUES ($1, $2, $3, $4)
       ON CONFLICT (category, name) DO NOTHING`, [item.category, item.name, item.week, item.days],
    )
  }

  const articles = [
    ['urgent-en', 'Urgent danger signs', 'en', 'Seek emergency care now for heavy bleeding, severe headache, fits, severe difficulty breathing, or reduced baby movement. Contact your community health volunteer while arranging care.', ['bleeding', 'headache', 'fits', 'breathing', 'movement', 'danger'], 'urgent'],
    ['urgent-sw', 'Dalili za hatari', 'sw', 'Tafuta huduma ya dharura sasa ukiona damu nyingi, maumivu makali ya kichwa, degedege, shida kubwa ya kupumua, au mtoto kutocheza kama kawaida. Wasiliana na mhudumu wa afya unapopanga kupata huduma.', ['damu', 'kichwa', 'degedege', 'kupumua', 'mtoto kucheza', 'hatari'], 'urgent'],
    ['anc-en', 'Antenatal care', 'en', 'Attend every antenatal care appointment, even when you feel well. A health worker can check your health and your baby’s growth.', ['pregnancy', 'antenatal', 'anc', 'clinic', 'visit'], 'pregnancy'],
    ['anc-sw', 'Huduma ya ujauzito', 'sw', 'Hudhuria miadi yote ya kliniki ya wajawazito hata kama unajisikia vizuri. Mhudumu wa afya anaweza kukagua afya yako na ukuaji wa mtoto.', ['ujauzito', 'kliniki', 'miadi'], 'pregnancy'],
  ]
  for (const [slug, title, language, body, keywords, category] of articles) {
    await pool.query(
      `INSERT INTO health_content (slug, title, language, body, keywords, category, approved)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE) ON CONFLICT (slug) DO NOTHING`,
      [slug, title, language, body, keywords, category],
    )
  }
  console.info('Seed data ready')
} finally {
  await pool.end()
}import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

async function upsertAccount(username, password, role, name) {
  const passwordHash = await bcrypt.hash(password, 12)
  const result = await pool.query(
    `INSERT INTO users (role, username, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, active = TRUE, updated_at = NOW()
     RETURNING id`, [role, username, passwordHash],
  )
  if (role === 'chw') {
    await pool.query(
      `INSERT INTO chw_profiles (user_id, name) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name`, [result.rows[0].id, name],
    )
  }
}

try {
  if (process.env.SEED_CHW_PASSWORD) {
    await upsertAccount(process.env.SEED_CHW_USERNAME || 'chw', process.env.SEED_CHW_PASSWORD, 'chw', 'Afya Toto CHV')
  }
  if (process.env.SEED_ADMIN_PASSWORD) {
    await upsertAccount(process.env.SEED_ADMIN_USERNAME || 'admin', process.env.SEED_ADMIN_PASSWORD, 'admin', 'Afya Toto Administrator')
  }

  const schedules = [
    ...[12, 20, 26, 30, 34, 36, 38, 40].map((week, index) => ({ category: 'anc', name: `ANC contact ${index + 1}`, week })),
    ...[
      ['BCG + Polio 0', 0],
      ['Penta, PCV, Polio, Rota (dose 1)', 6],
      ['Penta, PCV, Polio, Rota (dose 2)', 10],
      ['Penta, PCV, Polio, Rota, IPV (dose 3)', 14],
      ['Measles-Rubella 1 (9 months)', 39],
      ['Measles-Rubella 2 (18 months)', 78],
    ].map(([name, week]) => ({ category: 'immunization', name, week })),
    ...[
      ['Postnatal check (48 hours)', 2],
      ['Postnatal check (1-2 weeks)', 10],
      ['Postnatal check (6 weeks)', 42],
      ['Postnatal check (4-6 months)', 150],
    ].map(([name, offsetDays]) => ({ category: 'pnc', name, week: 0, offsetDays })),
  ]
  for (const rule of schedules) {
    await pool.query(
      `INSERT INTO schedule_rules (category, name, due_week, offset_days) VALUES ($1, $2, $3, $4)
       ON CONFLICT (category, name) DO NOTHING`, [rule.category, rule.name, rule.week, rule.offsetDays || 0],
    )
  }

  const content = [
    ['danger-signs-en', 'Urgent danger signs', 'en', 'Seek emergency care now for heavy bleeding, severe headache, fits, severe difficulty breathing, or reduced baby movement. Contact your community health volunteer while arranging care.', ['bleeding', 'headache', 'fits', 'breathing', 'movement', 'danger'], 'urgent'],
    ['danger-signs-sw', 'Dalili za hatari', 'sw', 'Tafuta huduma ya dharura sasa ukiona damu nyingi, maumivu makali ya kichwa, degedege, shida kubwa ya kupumua, au mtoto kutocheza kama kawaida. Wasiliana na mhudumu wa afya unapopanga kupata huduma.', ['damu', 'kichwa', 'degedege', 'kupumua', 'mtoto kucheza', 'hatari'], 'urgent'],
    ['anc-en', 'Antenatal care', 'en', 'Attend every antenatal care appointment, even when you feel well. A health worker can check your health and your baby’s growth.', ['pregnancy', 'antenatal', 'anc', 'clinic', 'visit'], 'pregnancy'],
    ['anc-sw', 'Huduma ya ujauzito', 'sw', 'Hudhuria miadi yote ya kliniki ya wajawazito hata kama unajisikia vizuri. Mhudumu wa afya anaweza kukagua afya yako na ukuaji wa mtoto.', ['ujauzito', 'kliniki', 'miadi'], 'pregnancy'],
  ]
  for (const [slug, title, language, body, keywords, category] of content) {
    await pool.query(
      `INSERT INTO health_content (slug, title, language, body, keywords, category, approved)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE) ON CONFLICT (slug) DO NOTHING`,
      [slug, title, language, body, keywords, category],
    )
  }
  console.info('Seed data ready')
} finally {
  await pool.end()
}