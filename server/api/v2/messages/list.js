/**
 * server/api/v2/messages/list.js
 *
 * GET /api/v2/bookings/:id/messages - the real message history for one Booking (Project
 * Passport), oldest first. Same authorization rule as send.js: only the booking's customer or
 * the business's owner can read it. Also marks messages as read by the requester.
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const Message = require('../../../models/Message');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;

  if (!isConnected()) {
    await connect();
  }
  if (!isConnected()) {
    res.status(503).json({
      error: 'database_unavailable',
      message: 'The account database is not configured yet (MONGODB_URI is unset or unreachable).',
    });
    return;
  }

  const booking = await Booking.findById(id);
  if (!booking) {
    res.status(404).json({ error: 'not_found', message: 'This request no longer exists.' });
    return;
  }

  const business = await Business.findById(booking.business);
  const requesterId = String(req.appUser._id);
  const isCustomer = String(booking.customer) === requesterId;
  const isProvider = business && String(business.owner) === requesterId;

  if (!isCustomer && !isProvider) {
    res.status(403).json({
      error: 'forbidden',
      message: 'You are not part of this conversation.',
    });
    return;
  }

  const messages = await Message.find({ booking: booking._id }).sort({ createdAt: 1 });

  const unreadIds = messages
    .filter(m => !m.readBy.some(uid => String(uid) === requesterId))
    .map(m => m._id);
  if (unreadIds.length > 0) {
    await Message.updateMany(
      { _id: { $in: unreadIds } },
      { $addToSet: { readBy: req.appUser._id } }
    );
  }

  res.status(200).json({
    messages: messages.map(m => m.toObject({ versionKey: false })),
  });
};
