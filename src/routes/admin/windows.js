const express = require('express');
const { pool } = require('../../db');
const { requireLogin, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireRole(['admin']));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT w.*, qt.name AS queue_name FROM windows w
     JOIN queue_types qt ON qt.id = w.queue_type_id
     ORDER BY w.window_number ASC`
  );
  res.json({ success: true, windows: rows });
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { window_name: windowName, queue_type_id: queueTypeId, status } = req.body || {};
  await pool.query(
    'UPDATE windows SET window_name = $1, queue_type_id = $2, status = $3 WHERE id = $4',
    [windowName, queueTypeId, status, id]
  );
  res.json({ success: true });
});

module.exports = router;
