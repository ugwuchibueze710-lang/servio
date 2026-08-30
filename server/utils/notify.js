/**
 * server/utils/notify.js
 *
 * Thin helper around Notification.create used by the real event sites (new request, accepted,
 * declined, message, quote, completed, confirmed, payout, review, dispute, cancellation - spec
 * section 40). Deliberately swallows its own errors (logged, never thrown) so a notification
 * failure can never break the booking/message/payment flow that triggered it.
 */
const Notification = require('../models/Notification');

const notify = async ({ recipient, type, booking, title, body }) => {
  if (!recipient || !type || !title) return;
  try {
    await Notification.create({ recipient, type, booking, title, body });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notify] failed to create notification:', type, err.message);
  }
};

module.exports = { notify };
