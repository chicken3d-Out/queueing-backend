const express = require('express');
const { pool } = require('../../db');
const { requireLogin, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// Reading the list of transactions/queue types is needed by Front Desk too
// (to populate the "which transaction?" dropdown) — only editing ranges is
// admin-only.
router.get('/', requireRole(['admin', 'frontdesk']), async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM queue_types ORDER BY start_number ASC');
  res.json({ success: true, queue_types: rows });
});

router.put('/:id', requireRole(['admin']), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, start_number: startNumber, end_number: endNumber, active } = req.body || {};
  await pool.query(
    'UPDATE queue_types SET name = $1, start_number = $2, end_number = $3, active = $4 WHERE id = $5',
    [name, startNumber, endNumber, !!active, id]
  );
  res.json({ success: true });
});

module.exports = router;
