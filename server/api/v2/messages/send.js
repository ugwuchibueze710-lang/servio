/**
 * server/api/v2/messages/send.js
 *
 * POST /api/v2/bookings/:id/messages - real, persisted messaging tied to one Booking (Project
 * Passport). Only the booking's customer or the business's owner may post - checked against the
 * actual database records, never trusted from the client (spec section 55).
 */
const Booking = require('../../../models/Booking');
const Business = require('../../../models/Business');
const Message = require('../../../models/Message');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
  const { id } = req.params;
  const { text, imageUrl } = req.body || {};

  const trimmedText = typeof text === 'string' ? text.trim() : '';
  if (!trimmedText && !imageUrl) {
    res.status(400).json({ error: 'empty_message', message: 'A message needs text or an image.' });
    return;
  }

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

  const message = await Message.create({
    booking: booking._id,
    sender: req.appUser._id,
    type: imageUrl ? 'image' : 'text',
    text: trimmedText || undefined,
    imageUrl: imageUrl || undefined,
    readBy: [req.appUser._id],
  });

  res.status(201).json({ message: message.toObject({ versionKey: false }) });
};
