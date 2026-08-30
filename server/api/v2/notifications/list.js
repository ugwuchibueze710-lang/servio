/**
 * server/api/v2/notifications/list.js
 *
 * GET /api/v2/notifications - the real, persisted notification list for the current account
 * (spec section 40), newest first. Optional ?unreadOnly=true.
 */
const Notification = require('../../../models/Notification');
const { isConnected, connect } = require('../../../db/mongoose');

module.exports = async (req, res) => {
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

  const filter = { recipient: req.appUser._id };
  if (req.query.unreadOnly === 'true') {
    filter.read = false;
  }

  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(100);
  const unreadCount = await Notification.countDocuments({ recipient: req.appUser._id, read: false });

  res.status(200).json({
    notifications: notifications.map(n => n.toObject({ versionKey: false })),
    unreadCount,
  });
};
