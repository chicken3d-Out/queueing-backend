const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required.' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
  const user = rows[0];

  if (!user || user.status !== 'active') {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  // Passwords migrated from the PHP system were hashed with PASSWORD_DEFAULT
  // (bcrypt, "$2y$" prefix) — bcryptjs verifies those transparently, no
  // migration step needed for existing accounts.
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ success: false, error: 'Invalid username or password.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      window_id: user.window_id,
    },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      window_id: user.window_id,
    },
  });
});

module.exports = router;
