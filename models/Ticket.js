const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
  },
  category: {
    type: String,
    enum: ['order', 'product', 'payment', 'technical', 'other'],
    default: 'other',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'solved', 'closed'],
    default: 'open',
  },
  messages: [
    {
      sender: {
        type: String,
        enum: ['user', 'admin'],
        required: true,
      },
      senderName: String,
      message: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  attachments: [
    {
      filename: String,
      url: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  resolvedAt: Date,
  resolvedBy: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update timestamp on save (synchronous middleware)
ticketSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('Ticket', ticketSchema);
