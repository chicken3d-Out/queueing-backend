require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { setIO } = require('./sockets');

const authRoutes = require('./routes/auth');
const frontdeskRoutes = require('./routes/frontdesk');
const windowRoutes = require('./routes/window');
const displayRoutes = require('./routes/display');
const queueRoutes = require('./routes/queue');
const dashboardRoutes = require('./routes/dashboard');
const adminUsersRoutes = require('./routes/admin/users');
const adminWindowsRoutes = require('./routes/admin/windows');
const adminQueuesRoutes = require('./routes/admin/queues');
const adminSettingsRoutes = require('./routes/admin/settings');

const app = express();
const server = http.createServer(app);

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',').map((s) => s.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ---- REST API ---------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/frontdesk', frontdeskRoutes);
app.use('/api/window', windowRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin/users', adminUsersRoutes);
app.use('/api/admin/windows', adminWindowsRoutes);
app.use('/api/admin/queues', adminQueuesRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);

app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));

// Global fallback — never leak internals unless APP_DEBUG is explicitly on.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const message = process.env.APP_DEBUG === 'true' ? err.message : 'A system error occurred. Please contact the administrator.';
  res.status(500).json({ success: false, error: message });
});

// ---- Socket.IO — real-time push, replaces client-side polling entirely --
// Every display/dashboard holds ONE persistent connection instead of
// re-requesting on a timer. Route handlers call broadcastQueueUpdate() /
// broadcastTicketCalled() after any state change (see sockets.js), which
// fan out to every connected client instantly.
const io = new Server(server, {
  cors: { origin: allowedOrigins },
});
setIO(io);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Queueing System backend listening on port ${PORT}`);
});
