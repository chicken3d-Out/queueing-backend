const express = require('express');
const { pool } = require('../../db');
const { requireLogin, requireRole } = require('../../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireRole(['admin']));

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO system_settings (setting_key, setting_value) VALUES ($1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [key, value]
  );
}

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT setting_key, setting_value FROM system_settings');
  res.json({ success: true, settings: Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value])) });
});

router.post('/', async (req, res) => {
  const { site_title: siteTitle, announcements_enabled: announcementsEnabled, session_timeout_minutes: sessionTimeout, display_stale_minutes: staleMinutes } = req.body || {};

  await setSetting('site_title', siteTitle || 'Queueing System');
  await setSetting('announcements_enabled', announcementsEnabled ? '1' : '0');
  await setSetting('session_timeout_minutes', String(Math.max(5, parseInt(sessionTimeout, 10) || 30)));
  await setSetting('display_stale_minutes', String(Math.max(1, parseInt(staleMinutes, 10) || 10)));

  res.json({ success: true });
});

module.exports = router;
