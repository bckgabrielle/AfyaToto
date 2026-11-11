import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pool } from '../src/db.js'

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  const migrationDirectory = resolve('db/migrations')
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
    if (existing.rowCount) continue
    const sql = await readFile(resolve(migrationDirectory, name), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    console.info(`Applied ${name}`)
  }
  console.info('Database schema is up to date')
} finally {
  await pool.end()
}import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pool } from '../src/db.js'

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  const migrationDirectory = resolve('db/migrations')
  const migrations = (await readdir(migrationDirectory)).filter((name) => name.endsWith('.sql')).sort()
  for (const name of migrations) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])
    if (existing.rowCount) continue
    const sql = await readFile(resolve(migrationDirectory, name), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    console.info(`Applied ${name}`)
  }
  console.info('Database schema is up to date')
} finally {
  await pool.end()
}