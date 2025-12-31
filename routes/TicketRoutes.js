const express = require('express');
const Ticket = require('../models/Ticket');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// ========== USER ROUTES ==========

// Get all tickets for logged-in user
router.get('/my-tickets', requireAuth, async (req, res, next) => {
  try {
    const tickets = await Ticket.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName email');
    res.json({ success: true, count: tickets.length, data: tickets });
  } catch (error) {
    next(error);
  }
});

// Get single ticket (user can only view their own)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    console.log(
      '[Tickets] GET /:id - req.user present:',
      !!req.user,
      'userId:',
      req.user && req.user._id
    );
    const ticket = await Ticket.findById(req.params.id).populate(
      'user',
      'firstName lastName email'
    );
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    // Check if user owns this ticket or is admin
    if (ticket.user._id.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

// Create new ticket
router.post('/', requireAuth, async (req, res, next) => {
  try {
    console.log('[Tickets] POST / - incoming request');
    console.log('[Tickets] req.user present:', !!req.user);
    if (req.user) {
      try {
        console.log(
          '[Tickets] req.user._id:',
          req.user._id ? req.user._id.toString() : req.user._id
        );
      } catch (e) {
        console.log('[Tickets] req.user inspect error:', e.message);
      }
      try {
        console.log(
          '[Tickets] req.user keys:',
          Object.keys(req.user.toObject ? req.user.toObject() : req.user)
        );
      } catch (e) {
        /* ignore */
      }
    }
    console.log('[Tickets] request body type:', typeof req.body);
    console.log('[Tickets] request body keys:', Object.keys(req.body || {}));

    // Defensive: ensure authentication middleware provided a user
    if (!req.user || !req.user._id) {
      console.error('[Tickets] Authentication failed: req.user missing or invalid');
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    const { subject, description, category, priority } = req.body;
    if (!subject || !description) {
      return res
        .status(400)
        .json({ success: false, error: 'Subject and description are required' });
    }

    const ticket = new Ticket({
      user: req.user._id,
      subject,
      description,
      category: category || 'other',
      priority: priority || 'medium',
      messages: [
        {
          sender: 'user',
          senderName: `${req.user.firstName} ${req.user.lastName}`,
          message: description,
          timestamp: new Date(),
        },
      ],
    });

    const saved = await ticket.save();
    console.log('[Tickets] ticket saved id:', saved._id && saved._id.toString());
    await saved.populate('user', 'firstName lastName email');
    console.log(
      '[Tickets] ticket populated user:',
      saved.user && (saved.user.firstName || saved.user.email)
    );
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    console.error('Error creating ticket:', error);
    console.error('Request body:', req.body);
    // Handle Mongoose validation errors as 400 Bad Request
    if (error && error.name === 'ValidationError') {
      const details = {};
      Object.keys(error.errors || {}).forEach((key) => {
        details[key] = error.errors[key].message;
      });
      return res.status(400).json({ success: false, error: 'Validation failed', details });
    }
    next(error);
  }
});

// Add reply to ticket (user can reply to their own ticket)
router.post('/:id/reply', requireAuth, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // If ticket is closed, do not allow users to reply (session is closed)
    if (ticket.status === 'closed') {
      return res.status(403).json({ success: false, error: 'Ticket is closed' });
    }

    // Check if user owns this ticket
    if (ticket.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    ticket.messages.push({
      sender: 'user',
      senderName: `${req.user.firstName} ${req.user.lastName}`,
      message: message.trim(),
      timestamp: new Date(),
    });

    // If ticket was solved, reopen it
    if (ticket.status === 'solved' || ticket.status === 'closed') {
      ticket.status = 'open';
      ticket.resolvedAt = undefined;
      ticket.resolvedBy = undefined;
    }

    await ticket.save();
    await ticket.populate('user', 'firstName lastName email');

    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

// Update ticket status (users can update their own ticket status)
router.patch('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const allowed = ['open', 'in-progress', 'solved', 'closed'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status value' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Only owner or admin can change status
    if (ticket.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    ticket.status = status;
    if (status === 'solved' || status === 'closed') {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy =
        req.user.firstName && req.user.lastName
          ? `${req.user.firstName} ${req.user.lastName}`
          : 'User';
    } else {
      ticket.resolvedAt = undefined;
      ticket.resolvedBy = undefined;
    }

    await ticket.save();
    await ticket.populate('user', 'firstName lastName email');
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

// ========== ADMIN ROUTES ==========

// Get all tickets (admin only)
router.get('/admin/all', requireAdmin, async (req, res, next) => {
  try {
    const { status, category, priority } = req.query;
    const filter = {};

    if (status && status !== 'all') filter.status = status;
    if (category && category !== 'all') filter.category = category;
    if (priority && priority !== 'all') filter.priority = priority;

    const tickets = await Ticket.find(filter)
      .sort({ createdAt: -1 })
      .populate('user', 'firstName lastName email');

    res.json({ success: true, count: tickets.length, data: tickets });
  } catch (error) {
    next(error);
  }
});

// Admin reply to ticket
router.post('/admin/:id/reply', requireAdmin, async (req, res, next) => {
  try {
    console.log('[Tickets] ADMIN REPLY - req.admin:', !!req.admin);
    console.log('[Tickets] ADMIN REPLY - request body keys:', Object.keys(req.body || {}));
    const { message, status } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    // Prevent reply if ticket is closed or solved, unless status is being set to reopen
    const isClosed = ticket.status === 'closed' || ticket.status === 'solved';
    const willReopen = status === 'open' || status === 'in-progress';
    if (isClosed && !willReopen) {
      return res
        .status(403)
        .json({
          success: false,
          error: 'Cannot reply to a closed or solved ticket. Reopen the ticket to reply.',
        });
    }

    // If admin is reopening, update status
    if (willReopen) {
      ticket.status = status;
      ticket.resolvedAt = undefined;
      ticket.resolvedBy = undefined;
    }

    ticket.messages.push({
      sender: 'admin',
      senderName: 'Support Team',
      message: message.trim(),
      timestamp: new Date(),
    });

    // If status is being set to closed/solved, update resolved fields
    if (status === 'solved' || status === 'closed') {
      ticket.status = status;
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = 'Admin';
    }

    await ticket.save();
    await ticket.populate('user', 'firstName lastName email');
    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

// Update ticket status (admin only)
router.patch('/admin/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }

    ticket.status = status;
    if (status === 'solved' || status === 'closed') {
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = 'Admin';
    } else {
      ticket.resolvedAt = undefined;
      ticket.resolvedBy = undefined;
    }

    await ticket.save();
    await ticket.populate('user', 'firstName lastName email');

    res.json({ success: true, data: ticket });
  } catch (error) {
    next(error);
  }
});

// Delete ticket (admin only)
router.delete('/admin/:id', requireAdmin, async (req, res, next) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
