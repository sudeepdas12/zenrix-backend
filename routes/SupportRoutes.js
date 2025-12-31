const express = require('express');
const router = express.Router();
const Support = require('../models/Support');
const { requireAdmin } = require('../middleware/auth');

// Simple validator for incoming support payloads
function validateSupportPayload(body) {
  const { name, email, subject, message } = body || {};
  if (!name || !email || !subject || !message) return false;
  return {
    name: String(name).trim(),
    email: String(email).trim(),
    subject: String(subject).trim(),
    message: String(message).trim(),
  };
}

// Public: Submit support request
router.post('/', async (req, res) => {
  try {
    const payload = validateSupportPayload(req.body);
    if (!payload) return res.status(400).json({ success: false, error: 'All fields are required' });
    const support = new Support(payload);
    await support.save();
    res.status(201).json({ success: true, data: support });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Admin: List all support requests
router.get('/admin/all', requireAdmin, async (_req, res) => {
  try {
    const requests = await Support.find().sort({ createdAt: -1 });
    res.json({ success: true, count: requests.length, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Update support request status
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const support = await Support.findById(req.params.id);
    if (!support)
      return res.status(404).json({ success: false, error: 'Support request not found' });
    support.status = status || support.status;
    await support.save();
    res.json({ success: true, data: support });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Admin: Delete support request
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await Support.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ success: false, error: 'Support request not found' });
    res.json({ success: true, data: deleted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
