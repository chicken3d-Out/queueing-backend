const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../../db');
const { requireLogin, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireRole(['admin']));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.role, u.window_id, u.status, w.window_number
     FROM users u LEFT JOIN windows w ON w.id = u.window_id
     ORDER BY u.id ASC`
  );
  res.json({ success: true, users: rows });
});

router.post('/', async (req, res) => {
  const { username, password, full_name: fullName, role, window_id: windowId } = req.body || {};
  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role, window_id, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [username, hash, fullName, role, role === 'window' ? windowId || null : null]
    );
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'That username is already taken.' });
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { username, full_name: fullName, role, window_id: windowId, new_password: newPassword } = req.body || {};

  if (newPassword) {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      `UPDATE users SET username = $1, full_name = $2, role = $3, window_id = $4, password_hash = $5 WHERE id = $6`,
      [username, fullName, role, role === 'window' ? windowId || null : null, hash, id]
    );
  } else {
    await pool.query(
      `UPDATE users SET username = $1, full_name = $2, role = $3, window_id = $4 WHERE id = $5`,
      [username, fullName, role, role === 'window' ? windowId || null : null, id]
    );
  }
  res.json({ success: true });
});

router.post('/:id/toggle-status', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await pool.query(`UPDATE users SET status = CASE WHEN status = 'active' THEN 'inactive' ELSE 'active' END WHERE id = $1`, [id]);
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  res.json({ success: true });
});

module.exports = router;
