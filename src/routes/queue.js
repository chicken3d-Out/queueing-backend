const express = require('express');
const { pool } = require('../db');
const { requireLogin } = require('../middleware/auth');
const { todayDate } = require('../utils/ticket');

const router = express.Router();
router.use(requireLogin);

router.get('/', async (req, res) => {
  const today = todayDate();
  const { rows } = await pool.query(
    `SELECT qt.id, qt.code, qt.name, qt.start_number, qt.end_number,
        SUM(CASE WHEN t.status = 'WAITING' THEN 1 ELSE 0 END) AS waiting,
        SUM(CASE WHEN t.status IN ('CALLED','SERVING') THEN 1 ELSE 0 END) AS serving,
        SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed
     FROM queue_types qt
     LEFT JOIN tickets t ON t.queue_type_id = qt.id AND t.queue_date = $1
     WHERE qt.active = TRUE
     GROUP BY qt.id
     ORDER BY qt.start_number ASC`,
    [today]
  );

  const queues = rows.map((r) => ({
    code: r.code,
    name: r.name,
    range: `${String(r.start_number).padStart(3, '0')}\u2013${String(r.end_number).padStart(3, '0')}`,
    waiting: parseInt(r.waiting, 10) || 0,
    serving: parseInt(r.serving, 10) || 0,
    completed: parseInt(r.completed, 10) || 0,
  }));

  res.json({ success: true, queues });
});

module.exports = router;
