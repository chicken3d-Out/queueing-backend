const express = require('express');
const { pool } = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');
const { formatTicketNumber, todayDate, logTicketHistory } = require('../utils/ticket');
const { broadcastQueueUpdate, broadcastTicketCalled } = require('../sockets');

const router = express.Router();
router.use(requireLogin, requireRole(['window']));

router.use((req, res, next) => {
  if (!req.user.window_id) {
    return res.status(403).json({ success: false, error: 'Your account is not assigned to a window. Contact the administrator.' });
  }
  next();
});

async function getWindowRow(client, windowId) {
  const { rows } = await client.query('SELECT * FROM windows WHERE id = $1 LIMIT 1', [windowId]);
  return rows[0] || null;
}

async function getCurrentTicketForWindow(client, windowId) {
  const { rows } = await client.query(
    `SELECT * FROM tickets WHERE window_id = $1 AND queue_date = $2 AND status IN ('CALLED', 'SERVING')
     ORDER BY called_at DESC LIMIT 1`,
    [windowId, todayDate()]
  );
  return rows[0] || null;
}

async function buildWindowState(client, windowId) {
  const window = await getWindowRow(client, windowId);
  const { rows: qtRows } = await client.query('SELECT * FROM queue_types WHERE id = $1 LIMIT 1', [window.queue_type_id]);
  const queueType = qtRows[0];

  const ticketRow = await getCurrentTicketForWindow(client, windowId);
  const current = ticketRow
    ? { id: ticketRow.id, number: formatTicketNumber(queueType.end_number, ticketRow.ticket_number), status: ticketRow.status }
    : null;

  const { rows: waitingRows } = await client.query(
    `SELECT COUNT(*) AS c FROM tickets WHERE queue_type_id = $1 AND queue_date = $2 AND status = 'WAITING'`,
    [window.queue_type_id, todayDate()]
  );

  return {
    success: true,
    window: { id: window.id, number: window.window_number, name: window.window_name },
    queue: { code: queueType.code, name: queueType.name },
    current_ticket: current,
    waiting_count: parseInt(waitingRows[0].c, 10),
  };
}

router.get('/', async (req, res) => {
  res.json(await buildWindowState(pool, req.user.window_id));
});

router.post('/call-next', async (req, res) => {
  const windowId = req.user.window_id;
  const window = await getWindowRow(pool, windowId);
  const today = todayDate();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // SELECT ... FOR UPDATE SKIP LOCKED: if two operators somehow race on
    // the same queue, the second transaction skips past a row the first
    // already has locked instead of blocking behind it — it just picks the
    // next-oldest waiting ticket instead. Combined with the WHERE status =
    // 'WAITING' check on the UPDATE below, this guarantees two windows can
    // never be handed the same ticket.
    const { rows } = await client.query(
      `SELECT id FROM tickets
       WHERE queue_type_id = $1 AND queue_date = $2 AND status = 'WAITING'
       ORDER BY created_at ASC, id ASC
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [window.queue_type_id, today]
    );

    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'No waiting tickets in this queue.' });
    }

    const ticketId = rows[0].id;
    const upd = await client.query(
      `UPDATE tickets SET status = 'CALLED', window_id = $1, called_at = now()
       WHERE id = $2 AND status = 'WAITING'`,
      [windowId, ticketId]
    );

    if (upd.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Ticket was just taken by another window. Please try again.' });
    }

    await client.query('UPDATE windows SET current_ticket_id = $1 WHERE id = $2', [ticketId, windowId]);
    await logTicketHistory(client, { ticketId, action: 'CALL_NEXT', fromStatus: 'WAITING', toStatus: 'CALLED', windowId, userId: req.user.id });

    await client.query('COMMIT');

    const state = await buildWindowState(pool, windowId);
    broadcastQueueUpdate();
    if (state.current_ticket) {
      broadcastTicketCalled({ window_number: state.window.number, number: state.current_ticket.number });
    }
    res.json(state);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('call_next failed:', err);
    res.status(500).json({ success: false, error: process.env.APP_DEBUG === 'true' ? err.message : 'A system error occurred while calling the next ticket.' });
  } finally {
    client.release();
  }
});

router.post('/recall', async (req, res) => {
  const windowId = req.user.window_id;
  const ticket = await getCurrentTicketForWindow(pool, windowId);
  if (!ticket) {
    return res.status(400).json({ success: false, error: 'There is no ticket currently assigned to this window.' });
  }
  await pool.query(`UPDATE tickets SET status = 'CALLED', called_at = now() WHERE id = $1 AND window_id = $2`, [ticket.id, windowId]);
  await logTicketHistory(pool, { ticketId: ticket.id, action: 'RECALL', toStatus: 'CALLED', windowId, userId: req.user.id });

  const state = await buildWindowState(pool, windowId);
  broadcastQueueUpdate();
  broadcastTicketCalled({ window_number: state.window.number, number: state.current_ticket.number });
  res.json(state);
});

router.post('/serving', async (req, res) => {
  const windowId = req.user.window_id;
  const ticket = await getCurrentTicketForWindow(pool, windowId);
  if (!ticket) {
    return res.status(400).json({ success: false, error: 'There is no ticket currently assigned to this window.' });
  }
  await pool.query(`UPDATE tickets SET status = 'SERVING', serving_at = now() WHERE id = $1 AND window_id = $2`, [ticket.id, windowId]);
  await logTicketHistory(pool, { ticketId: ticket.id, action: 'START_SERVING', fromStatus: 'CALLED', toStatus: 'SERVING', windowId, userId: req.user.id });

  const state = await buildWindowState(pool, windowId);
  broadcastQueueUpdate();
  res.json(state);
});

router.post('/complete', async (req, res) => {
  const windowId = req.user.window_id;
  const ticket = await getCurrentTicketForWindow(pool, windowId);
  if (!ticket) {
    return res.status(400).json({ success: false, error: 'There is no ticket currently assigned to this window.' });
  }
  await pool.query(`UPDATE tickets SET status = 'COMPLETED', completed_at = now() WHERE id = $1`, [ticket.id]);
  await pool.query('UPDATE windows SET current_ticket_id = NULL WHERE id = $1', [windowId]);
  await logTicketHistory(pool, { ticketId: ticket.id, action: 'COMPLETE', toStatus: 'COMPLETED', windowId, userId: req.user.id });

  const state = await buildWindowState(pool, windowId);
  broadcastQueueUpdate();
  res.json(state);
});

router.post('/skip', async (req, res) => {
  const windowId = req.user.window_id;
  const ticket = await getCurrentTicketForWindow(pool, windowId);
  if (!ticket) {
    return res.status(400).json({ success: false, error: 'There is no ticket currently assigned to this window.' });
  }
  const reason = (req.body?.reason || '').trim();
  await pool.query(`UPDATE tickets SET status = 'SKIPPED', skipped_at = now() WHERE id = $1`, [ticket.id]);
  await pool.query('UPDATE windows SET current_ticket_id = NULL WHERE id = $1', [windowId]);
  await logTicketHistory(pool, { ticketId: ticket.id, action: 'SKIP', toStatus: 'SKIPPED', windowId, userId: req.user.id, notes: reason || null });

  const state = await buildWindowState(pool, windowId);
  broadcastQueueUpdate();
  res.json(state);
});

module.exports = router;
