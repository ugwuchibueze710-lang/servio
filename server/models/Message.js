/**
 * Message - real, persisted messaging tied to a specific Booking (Project Passport). Never a
 * standalone chat system (spec section 20) - every message belongs to the job it's about.
 */
const mongoose = require('mongoose');

const MESSAGE_TYPE_VALUES = ['text', 'image', 'system'];

const messageSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'AppUser', required: true, index: true },
    type: { type: String, enum: MESSAGE_TYPE_VALUES, default: 'text' },
    text: { type: String, trim: true, maxlength: 4000 },
    imageUrl: { type: String },
    // For system messages (request accepted, job completed, payment received, etc.) - lets the
    // client render them distinctly without a separate table.
    systemEventKey: { type: String, trim: true, maxlength: 80 },
    readBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AppUser' }],
      default: [],
    },
  },
  { timestamps: true }
);

messageSchema.index({ booking: 1, createdAt: 1 });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
module.exports.MESSAGE_TYPE_VALUES = MESSAGE_TYPE_VALUES;
