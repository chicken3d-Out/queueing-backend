const express = require('express');
const { pool } = require('../db');
const { formatTicketNumber, todayDate } = require('../utils/ticket');

const router = express.Router();

// Public, unauthenticated — same as the original PHP version (read-only
// queue numbers, no personal data). Unlike the PHP version, the client does
// NOT call this on a timer: it's fetched once on load, and again only when
// the socket reconnects after a drop. Every other update arrives instantly
// via the 'queue:update' socket event instead of a fixed-interval request.
router.get('/', async (req, res) => {
  const today = todayDate();

  const settingsRes = await pool.query(
    `SELECT setting_key, setting_value FROM system_settings
     WHERE setting_key IN ('site_title', 'announcements_enabled', 'display_stale_minutes')`
  );
  const settings = Object.fromEntries(settingsRes.rows.map((r) => [r.setting_key, r.setting_value]));
  const siteTitle = settings.site_title || 'Queueing System';
  const announcementsEnabled = (settings.announcements_enabled ?? '1') === '1';
  const staleMinutes = Math.max(1, parseInt(settings.display_stale_minutes || '10', 10));

  const windowRows = (
    await pool.query(
      `SELECT w.id AS window_id, w.window_number, w.window_name, w.status AS window_status,
          qt.id AS queue_type_id, qt.code AS queue_code, qt.name AS queue_name, qt.end_number
       FROM windows w
       JOIN queue_types qt ON qt.id = w.queue_type_id
       ORDER BY w.window_number ASC`
    )
  ).rows;

  const currentRows = (
    await pool.query(
      `SELECT window_id, ticket_number FROM (
          SELECT window_id, ticket_number,
                 ROW_NUMBER() OVER (PARTITION BY window_id ORDER BY called_at DESC) AS rn
          FROM tickets
          WHERE queue_date = $1 AND status IN ('CALLED', 'SERVING') AND window_id IS NOT NULL
       ) ranked WHERE rn = 1`,
      [today]
    )
  ).rows;
  const currentByWindow = Object.fromEntries(currentRows.map((r) => [r.window_id, r.ticket_number]));

  const nextRows = (
    await pool.query(
      `SELECT queue_type_id, ticket_number FROM (
          SELECT queue_type_id, ticket_number,
                 ROW_NUMBER() OVER (PARTITION BY queue_type_id ORDER BY created_at ASC, id ASC) AS rn
          FROM tickets
          WHERE queue_date = $1 AND status = 'WAITING'
       ) ranked WHERE rn <= 4
       ORDER BY queue_type_id ASC, rn ASC`,
      [today]
    )
  ).rows;
  const nextByQueueType = {};
  for (const row of nextRows) {
    (nextByQueueType[row.queue_type_id] ||= []).push(row.ticket_number);
  }

  const windows = windowRows.map((r) => ({
    window_id: r.window_id,
    window_number: r.window_number,
    window_name: r.window_name,
    is_active: r.window_status === 'active',
    queue_code: r.queue_code,
    queue_name: r.queue_name,
    current_number: currentByWindow[r.window_id] != null ? formatTicketNumber(r.end_number, currentByWindow[r.window_id]) : null,
    next_up: (nextByQueueType[r.queue_type_id] || []).map((n) => formatTicketNumber(r.end_number, n)),
  }));

  const currentCallRes = await pool.query(
    `SELECT t.ticket_number, qt.end_number, w.window_number
     FROM tickets t
     JOIN queue_types qt ON qt.id = t.queue_type_id
     JOIN windows w ON w.id = t.window_id
     WHERE t.status IN ('CALLED', 'SERVING') AND t.called_at IS NOT NULL
       AND t.called_at >= (now() - ($1 || ' minutes')::interval)
     ORDER BY t.called_at DESC
     LIMIT 1`,
    [staleMinutes]
  );
  const currentCallRow = currentCallRes.rows[0];
  const currentCall = currentCallRow
    ? { window_number: currentCallRow.window_number, number: formatTicketNumber(currentCallRow.end_number, currentCallRow.ticket_number) }
    : null;

  res.json({
    success: true,
    site_title: siteTitle,
    windows,
    current_call: currentCall,
    announcements_enabled: announcementsEnabled,
  });
});

module.exports = router;
