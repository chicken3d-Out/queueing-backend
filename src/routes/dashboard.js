const express = require('express');
const { pool } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { todayDate } = require('../utils/ticket');

const router = express.Router();
router.use(requireLogin, requireRole(['admin']));

router.get('/', async (req, res) => {
  const today = todayDate();

  const totalsRes = await pool.query(
    `SELECT
        COUNT(*) AS total,
        SUM((status = 'WAITING')::int) AS waiting,
        SUM((status IN ('CALLED','SERVING'))::int) AS serving,
        SUM((status = 'COMPLETED')::int) AS completed,
        SUM((status = 'SKIPPED')::int) AS skipped,
        SUM((status = 'CANCELLED')::int) AS cancelled,
        SUM((status = 'TRANSFERRED')::int) AS transferred
     FROM tickets WHERE queue_date = $1`,
    [today]
  );
  const t = totalsRes.rows[0];

  const perQueueRes = await pool.query(
    `SELECT qt.name, COUNT(t.id) AS total
     FROM queue_types qt
     LEFT JOIN tickets t ON t.queue_type_id = qt.id AND t.queue_date = $1
     GROUP BY qt.id ORDER BY qt.start_number ASC`,
    [today]
  );

  const windowsRes = await pool.query(
    `SELECT w.window_number, w.window_name, w.status, qt.name AS queue_name
     FROM windows w JOIN queue_types qt ON qt.id = w.queue_type_id
     ORDER BY w.window_number ASC`
  );

  res.json({
    success: true,
    totals: {
      total: parseInt(t.total, 10) || 0,
      waiting: parseInt(t.waiting, 10) || 0,
      serving: parseInt(t.serving, 10) || 0,
      completed: parseInt(t.completed, 10) || 0,
      skipped: parseInt(t.skipped, 10) || 0,
      cancelled: parseInt(t.cancelled, 10) || 0,
      transferred: parseInt(t.transferred, 10) || 0,
    },
    per_queue: perQueueRes.rows.map((r) => ({ name: r.name, total: parseInt(r.total, 10) || 0 })),
    windows: windowsRes.rows.map((r) => ({
      number: r.window_number,
      name: r.window_name,
      status: r.status,
      queue_name: r.queue_name,
    })),
  });
});

module.exports = router;
