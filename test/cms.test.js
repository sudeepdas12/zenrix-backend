const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const expect = require('chai').expect;

describe('CMS - Pages & Components API', function() {
  this.timeout(30000);
  let token = null;
  let pageId = null;
  let compId = null;
  let mongod;
  let app;

  before(async function() {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
    // Clear server module cache so server.js re-initializes with this test's MONGODB_URI
    try { delete require.cache[require.resolve('../server')]; } catch (e) {}
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

  after(async function() {
    try { await mongoose.disconnect(); } catch (e) {}
    if (mongod) await mongod.stop();
  });

  it('should login as admin', async function() {
    const res = await request(app).post('/api/admin/login').send({ password: process.env.ADMIN_PASSWORD });
    expect(res.status).to.equal(200);
    expect(res.body.success).to.be.true;
    expect(res.body).to.have.property('token');
    token = res.body.token;
  });

  it('should create a page (protected)', async function() {
    const page = { slug: 'test-page', title: 'Test Page', content: '<p>Hello</p>' };
    const res = await request(app).post('/api/pages').set('Authorization', 'Bearer ' + token).send(page);
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    pageId = res.body.data._id;
  });

  it('should fetch page by slug', async function() {
    const res = await request(app).get('/api/pages/slug/test-page');
    expect(res.status).to.equal(200);
    expect(res.body.success).to.be.true;
    expect(res.body.data.title).to.equal('Test Page');
  });

  it('should fetch seeded index and products pages', async function() {
    const resIndex = await request(app).get('/api/pages/slug/index');
    expect(resIndex.status).to.equal(200);
    expect(resIndex.body.success).to.be.true;
    expect(resIndex.body.data.slug).to.equal('index');

    const resProducts = await request(app).get('/api/pages/slug/products');
    expect(resProducts.status).to.equal(200);
    expect(resProducts.body.success).to.be.true;
    expect(resProducts.body.data.slug).to.equal('products');
  });

  it('should update the page (protected)', async function() {
    const res = await request(app).put(`/api/pages/${pageId}`).set('Authorization', 'Bearer ' + token).send({ title: 'Updated Test Page' });
    expect(res.status).to.equal(200);
    expect(res.body.success).to.be.true;
    expect(res.body.data.title).to.equal('Updated Test Page');
  });

  it('should create a component (protected)', async function() {
    const comp = { slug: 'test-comp', name: 'Test Comp', html: '<a href="/">Home</a>' };
    const res = await request(app).post('/api/components').set('Authorization', 'Bearer ' + token).send(comp);
    expect(res.status).to.equal(201);
    expect(res.body.success).to.be.true;
    compId = res.body.data._id;
  });

  it('should fetch component by slug', async function() {
    const res = await request(app).get('/api/components/slug/test-comp');
    expect(res.status).to.equal(200);
    expect(res.body.success).to.be.true;
    expect(res.body.data.slug).to.equal('test-comp');
  });

  it('should update and delete page/component (protected)', async function() {
    const res1 = await request(app).delete(`/api/pages/${pageId}`).set('Authorization', 'Bearer ' + token);
    expect(res1.status).to.equal(200);
    expect(res1.body.success).to.be.true;

    const res2 = await request(app).delete(`/api/components/${compId}`).set('Authorization', 'Bearer ' + token);
    expect(res2.status).to.equal(200);
    expect(res2.body.success).to.be.true;
  });

  it('should allow admin preview of unpublished pages', async function() {
    // create unpublished page
    const page = { slug: 'unpublished-test', title: 'Unpublished', content: '<p>Hidden</p>', published: false };
    const r1 = await request(app).post('/api/pages').set('Authorization', 'Bearer ' + token).send(page);
    expect(r1.status).to.equal(201);
    const resPublic = await request(app).get('/api/pages/slug/unpublished-test');
    expect(resPublic.status).to.equal(404);

    const resPreview = await request(app).get('/api/pages/preview/unpublished-test').set('Authorization', 'Bearer ' + token);
    expect(resPreview.status).to.equal(200);
    expect(resPreview.body.success).to.be.true;
    expect(resPreview.body.data.slug).to.equal('unpublished-test');

    // cleanup
    await request(app).delete(`/api/pages/${r1.body.data._id}`).set('Authorization', 'Bearer ' + token);
  });

  it('should validate order payload', async function() {
    const bad = { orders: 'not-an-array' };
    const res = await request(app).post('/api/pages/order').set('Authorization', 'Bearer ' + token).send(bad);
    expect(res.status).to.equal(400);
    expect(res.body.success).to.be.false;
  });
});
