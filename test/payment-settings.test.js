const request = require('supertest');
const expect = require('chai').expect;
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

describe('Payment Settings API', function() {
  this.timeout(20000);
  let token = null;
  let originalSettings = null;
  let mongod;
  let app;

  before(async function() {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
    try { delete require.cache[require.resolve('../server')]; } catch (e) {}
    app = require('../server');

    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (mongoose.connection.readyState === 1) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const loginRes = await request(app).post('/api/admin/login').send({ password: process.env.ADMIN_PASSWORD });
    expect(loginRes.status).to.equal(200);
    expect(loginRes.body.success).to.be.true;
    token = loginRes.body.token;

    const baseline = await request(app).get('/api/payment-settings');
    expect(baseline.status).to.equal(200);
    expect(baseline.body.success).to.be.true;
    originalSettings = baseline.body.data;
  });

  after(async function() {
    try { await mongoose.disconnect(); } catch (e) {}
    if (mongod) await mongod.stop();
  });

  after(async function() {
    if (!token || !originalSettings) return;
    await request(app)
      .put('/api/payment-settings')
      .set('Authorization', 'Bearer ' + token)
      .send({
        codEnabled: originalSettings.codEnabled,
        bankEnabled: originalSettings.bankEnabled,
        bankDetails: originalSettings.bankDetails,
        instructions: originalSettings.instructions,
        qrImageUrl: originalSettings.qrImageUrl,
        nepaliWallets: originalSettings.nepaliWallets,
        updatedBy: 'tests:restore'
      });
  });

  it('should return payment settings with hydrated defaults', async function() {
    const res = await request(app).get('/api/payment-settings');
    expect(res.status).to.equal(200);
    expect(res.body.success).to.be.true;
    expect(res.body.data).to.have.property('bankDetails');
    expect(res.body.data.bankDetails).to.have.property('accountName');
    expect(res.body.data).to.have.property('nepaliWallets');
    expect(res.body.data.nepaliWallets).to.have.property('esewa');
    expect(res.body.data.nepaliWallets).to.have.property('khalti');
  });

  it('should update payment instructions and wallet metadata', async function() {
    const payload = {
      codEnabled: false,
      bankEnabled: true,
      instructions: 'Call finance before dispatching the parcel.',
      qrImageUrl: 'https://cdn.example.com/payments/demo-qr.png',
      bankDetails: {
        accountName: 'Zenrix QA',
        accountNumber: '0099887766',
        bankName: 'Nabil Bank',
        branch: 'Lalitpur',
        swiftCode: 'NABLINBB'
      },
      nepaliWallets: {
        esewa: {
          enabled: true,
          walletNumber: '9800000000',
          instructions: 'Send slip to finance@zenrix.com',
          qrImageUrl: 'https://cdn.example.com/payments/esewa.png'
        },
        khalti: {
          enabled: false,
          walletNumber: '9811111111',
          instructions: 'Temporarily disabled for maintenance',
          qrImageUrl: ''
        }
      },
      updatedBy: 'Mocha Test'
    };

    const updateRes = await request(app)
      .put('/api/payment-settings')
      .set('Authorization', 'Bearer ' + token)
      .send(payload);

    expect(updateRes.status).to.equal(200);
    expect(updateRes.body.success).to.be.true;
    expect(updateRes.body.data.instructions).to.equal(payload.instructions);
    expect(updateRes.body.data.bankDetails.accountName).to.equal(payload.bankDetails.accountName);
    expect(updateRes.body.data.nepaliWallets.esewa.walletNumber).to.equal(payload.nepaliWallets.esewa.walletNumber);

    const verifyRes = await request(app).get('/api/payment-settings');
    expect(verifyRes.status).to.equal(200);
    expect(verifyRes.body.success).to.be.true;
    expect(verifyRes.body.data.instructions).to.equal(payload.instructions);
    expect(verifyRes.body.data.nepaliWallets.khalti.enabled).to.equal(payload.nepaliWallets.khalti.enabled);
  });
});
