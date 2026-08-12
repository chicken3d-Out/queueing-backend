const express = require('express');
const { pool } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { formatTicketNumber, todayDate, logTicketHistory } = require('../utils/ticket');
const { broadcastQueueUpdate } = require('../sockets');

const router = express.Router();
router.use(requireLogin, requireRole(['frontdesk', 'admin']));

router.get('/', async (req, res) => {
  const today = todayDate();
  const { rows } = await pool.query(
    `SELECT t.id, t.ticket_number, t.status, t.created_at, qt.code, qt.name AS queue_name, qt.end_number
     FROM tickets t
     JOIN queue_types qt ON qt.id = t.queue_type_id
     WHERE t.queue_date = $1 AND t.status NOT IN ('COMPLETED', 'CANCELLED')
     ORDER BY t.created_at DESC
     LIMIT 100`,
    [today]
  );

  const tickets = rows.map((r) => ({
    id: r.id,
    number: formatTicketNumber(r.end_number, r.ticket_number),
    status: r.status,
    queue_code: r.code,
    queue_name: r.queue_name,
    created_at: r.created_at,
  }));

  res.json({ success: true, tickets });
});

router.post('/add-ticket', async (req, res) => {
  const { queue_code: queueCode, ticket_number: ticketNumberRaw } = req.body || {};

  if (!queueCode || !ticketNumberRaw || !/^\d+$/.test(String(ticketNumberRaw))) {
    return res.status(400).json({ success: false, error: 'Please select a transaction and enter a valid ticket number.' });
  }

  const ticketNumber = parseInt(ticketNumberRaw, 10);
  const today = todayDate();

  const { rows: qtRows } = await pool.query('SELECT * FROM queue_types WHERE code = $1 LIMIT 1', [queueCode]);
  const queueType = qtRows[0];

  if (!queueType || !queueType.active) {
    return res.status(400).json({ success: false, error: 'Selected transaction queue is invalid or inactive.' });
  }
  if (ticketNumber < queueType.start_number || ticketNumber > queueType.end_number) {
    return res.status(400).json({
      success: false,
      error: `Ticket number is out of range for ${queueType.name} (${String(queueType.start_number).padStart(3, '0')}\u2013${String(queueType.end_number).padStart(3, '0')}).`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dup = await client.query(
      `SELECT id FROM tickets
       WHERE ticket_number = $1 AND queue_type_id = $2 AND queue_date = $3
       AND status NOT IN ('COMPLETED','CANCELLED','SKIPPED','TRANSFERRED')
       LIMIT 1 FOR UPDATE`,
      [ticketNumber, queueType.id, today]
    );
    if (dup.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: `Ticket ${formatTicketNumber(queueType.end_number, ticketNumber)} is already active in the queue.`,
      });
    }

    const insert = await client.query(
      `INSERT INTO tickets (ticket_number, queue_type_id, queue_date, status, registered_by)
       VALUES ($1, $2, $3, 'WAITING', $4) RETURNING id`,
      [ticketNumber, queueType.id, today, req.user.id]
    );
    const ticketId = insert.rows[0].id;

    await logTicketHistory(client, { ticketId, action: 'REGISTER', toStatus: 'WAITING', userId: req.user.id });

    await client.query('COMMIT');

    broadcastQueueUpdate();

    res.json({
      success: true,
      ticket: { id: ticketId, number: formatTicketNumber(queueType.end_number, ticketNumber), queue_name: queueType.name, status: 'WAITING' },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('add_ticket failed:', err);
    res.status(500).json({ success: false, error: process.env.APP_DEBUG === 'true' ? err.message : 'A system error occurred while registering the ticket.' });
  } finally {
    client.release();
  }
});

router.post('/cancel-ticket', async (req, res) => {
  const ticketId = parseInt(req.body?.ticket_id, 10);
  if (!ticketId) {
    return res.status(400).json({ success: false, error: 'Invalid ticket.' });
  }

  const { rows } = await pool.query('SELECT * FROM tickets WHERE id = $1 LIMIT 1', [ticketId]);
  const ticket = rows[0];
  if (!ticket) {
    return res.status(404).json({ success: false, error: 'Ticket not found.' });
  }
  if (ticket.status !== 'WAITING') {
    return res.status(400).json({ success: false, error: 'Only tickets still waiting can be cancelled.' });
  }

  await pool.query(`UPDATE tickets SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [ticketId]);
  await logTicketHistory(pool, { ticketId, action: 'CANCEL', fromStatus: 'WAITING', toStatus: 'CANCELLED', userId: req.user.id });

  broadcastQueueUpdate();
  res.json({ success: true });
});

module.exports = router;
