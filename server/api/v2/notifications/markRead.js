/**
 * server/api/v2/notifications/markRead.js
 *
 * PATCH /api/v2/notifications/:id/read - marks one of the current account's own notifications
 * read. PATCH /api/v2/notifications/read-all (id === 'read-all') marks all of them read.
 */
const Notification = require('../../../models/Notification');
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

  if (id === 'read-all') {
    await Notification.updateMany(
      { recipient: req.appUser._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.status(200).json({ ok: true });
    return;
  }

  const notification = await Notification.findOne({ _id: id, recipient: req.appUser._id });
  if (!notification) {
    res.status(404).json({ error: 'not_found', message: 'This notification could not be found.' });
    return;
  }
  notification.read = true;
  notification.readAt = new Date();
  await notification.save();

  res.status(200).json({ notification: notification.toObject({ versionKey: false }) });
};
