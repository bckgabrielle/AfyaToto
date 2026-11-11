import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import authRouter from './auth.js'
import domainRouter from './domain.js'

const app = express()
const origins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',').map((item) => item.trim())

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }))
app.use(express.json({ limit: '100kb' }))
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'afya-toto-api' }))
app.use('/api/auth', authRouter)
app.use('/api', domainRouter)

app.use((req, res) => res.status(404).json({ error: 'Not found' }))
app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' })
})

export default app