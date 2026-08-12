/** Zero-pad a ticket number to the width of the queue's end_number. */
function formatTicketNumber(endNumber, ticketNumber) {
  const width = String(endNumber).length;
  return String(ticketNumber).padStart(width, '0');
}

/** Today's date as YYYY-MM-DD in Asia/Manila, used to partition daily queue records. */
function todayDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Record a ticket_history row. */
async function logTicketHistory(client, { ticketId, action, fromStatus, toStatus, windowId, userId, notes }) {
  await client.query(
    `INSERT INTO ticket_history (ticket_id, action, from_status, to_status, window_id, user_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ticketId, action, fromStatus || null, toStatus || null, windowId || null, userId || null, notes || null]
  );
}

module.exports = { formatTicketNumber, todayDate, logTicketHistory };
