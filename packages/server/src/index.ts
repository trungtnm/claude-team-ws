import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { db, runMigrations, seedAdmin } from './db/index.js'
import { initSocketIO } from './services/socket-manager.js'
import authRoutes from './routes/auth.js'
import captureRoutes from './routes/captures.js'
import epicRoutes from './routes/epics.js'
import sessionRoutes from './routes/sessions.js'
import projectRoutes from './routes/projects.js'
import notificationRoutes from './routes/notifications.js'
import healthRoutes from './routes/health.js'

const app = express()
const httpServer = createServer(app)

// Middleware
app.use(helmet())
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173'],
  credentials: true,
}))
app.use(morgan('dev'))
app.use(express.json())
app.use(cookieParser())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/captures', captureRoutes)
app.use('/api/epics', epicRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/health', healthRoutes)

// Socket.IO
initSocketIO(httpServer)

// Database setup
try {
  runMigrations()
  seedAdmin()
} catch (error) {
  console.error('Lỗi khởi tạo cơ sở dữ liệu:', error)
}

// Start
const port = parseInt(process.env.PORT || '3000', 10)
httpServer.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`)
})

export { app, httpServer }
