let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

/**
 * Call this after ANY action that changes ticket/window state (register,
 * cancel, call_next, recall, serving, complete, skip). Every connected
 * display and dashboard just re-fetches the small "current state" payload
 * over REST when they receive this — no client ever polls on a timer.
 * Kept content-free on purpose: broadcasting "something changed, go re-fetch"
 * is simpler and less error-prone than trying to keep a full diff in sync
 * across every connected client, and the re-fetch itself is cheap (see
 * routes/display.js).
 */
function broadcastQueueUpdate() {
  if (ioInstance) {
    ioInstance.emit('queue:update');
  }
}

/** A ticket was just called — carries enough detail for a display to announce it immediately, without a round trip. */
function broadcastTicketCalled(payload) {
  if (ioInstance) {
    ioInstance.emit('ticket:called', payload);
  }
}

module.exports = { setIO, broadcastQueueUpdate, broadcastTicketCalled };
