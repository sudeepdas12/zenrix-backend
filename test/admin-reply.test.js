const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const assert = require('assert');

let mongod;
let app;

describe('Admin reply behavior for closed/solved tickets', function() {
  this.timeout(30000);

  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

    // Require app after setting MONGODB_URI
    app = require('../server');

    // Wait until mongoose is connected
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (mongoose.connection.readyState === 1) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  });

  after(async () => {
    try {
      await mongoose.disconnect();
    } catch (e) {}
    if (mongod) await mongod.stop();
  });

  it('blocks admin reply to closed ticket unless reopened in same request', async () => {
    const User = require('../models/User');
    const Ticket = require('../models/Ticket');

    // create a user with a unique email for this test run
    const uniqueEmail = `test.user+${Date.now()}@example.com`;
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: uniqueEmail,
      password: 'password123'
    });

    // create a closed ticket
    let ticket = await Ticket.create({
      user: user._id,
      subject: 'Issue',
      description: 'Problem description',
      messages: [{ sender: 'user', senderName: 'Test User', message: 'Hello' }],
      status: 'closed'
    });

    const adminToken = jwt.sign({ isAdmin: true }, process.env.JWT_SECRET);

    // attempt to reply without reopening -> should be forbidden (403)
    const res1 = await request(app)
      .post(`/api/tickets/admin/${ticket._id}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Admin reply while closed' });

    assert.strictEqual(res1.status, 403, 'Expected 403 when replying to closed ticket without reopen');

    // attempt to reply while providing status to reopen -> should succeed
    const res2 = await request(app)
      .post(`/api/tickets/admin/${ticket._id}/reply`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Reopen and reply', status: 'open' });

    assert.strictEqual(res2.status, 200, 'Expected 200 when reopening and replying');
    assert.strictEqual(res2.body.success, true);
    const updated = res2.body.data;
    assert.ok(Array.isArray(updated.messages), 'Messages should be present');
    const lastMsg = updated.messages[updated.messages.length - 1];
    assert.strictEqual(lastMsg.sender, 'admin');
    assert.strictEqual(updated.status, 'open');
  });
});
