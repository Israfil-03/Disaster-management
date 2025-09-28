import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, beforeAll, afterAll, afterEach, expect, it } from 'vitest';

import { app } from '../index.js';
import { closePool, ensureVolunteerTables, pool } from '../lib/db.js';

const signingSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
if (!signingSecret) {
  throw new Error('Missing JWT secret for volunteer workflow tests.');
}

const adminToken = jwt.sign(
  {
    email: 'coordinator@ndrf.gov.in',
    user_metadata: { full_name: 'Test Coordinator' },
  },
  signingSecret,
  { expiresIn: '1h' },
);

async function seedApplication(overrides = {}) {
  const payload = {
    fullName: 'Unit Volunteer',
    email: 'unit.volunteer@example.org',
    phone: '+919812345678',
    skills: ['First Aid & CPR', 'Logistics & Supply Chain'],
    availability: 'Weekends',
    preferredLocation: 'Pune',
    motivation: 'Ready to help on short notice',
    ...overrides,
  };

  const res = await request(app).post('/api/volunteers/apply').send(payload);
  return { payload, res };
}

describe('Volunteer registration workflow', () => {
  beforeAll(async () => {
    await ensureVolunteerTables();
  });

  afterEach(async () => {
    await pool.query('TRUNCATE volunteer_applications RESTART IDENTITY');
  });

  afterAll(async () => {
    await closePool();
  });

  it('stores a pending volunteer application with required fields', async () => {
    const { res } = await seedApplication();
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('application.id');
    expect(res.body.application.status).toBe('pending');

    const { rows } = await pool.query('SELECT full_name, email, status FROM volunteer_applications');
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('Unit Volunteer');
    expect(rows[0].status).toBe('pending');
  });

  it('validates volunteer payloads', async () => {
    const res = await request(app)
      .post('/api/volunteers/apply')
      .send({ email: 'invalid', skills: [], availability: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid input');
  });

  it('lets admins list pending applications', async () => {
    await seedApplication({ email: 'pending1@example.com' });
    await seedApplication({ email: 'pending2@example.com' });

    const res = await request(app)
      .get('/api/volunteers/applications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.applications)).toBe(true);
    expect(res.body.applications).toHaveLength(2);
    expect(res.body.applications[0]).toHaveProperty('status', 'pending');
  });

  it('allows admins to approve an application and exposes the volunteer publicly', async () => {
    const { res } = await seedApplication();
    const id = res.body.application.id;

    const approve = await request(app)
      .patch(`/api/volunteers/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', notes: 'Cleared background verification.' });

    expect(approve.status).toBe(200);
    expect(approve.body.application.status).toBe('approved');
    expect(approve.body.application.reviewedBy).toBeDefined();

    const publicList = await request(app).get('/api/volunteers');
    expect(publicList.status).toBe(200);
    expect(publicList.body.volunteers).toHaveLength(1);
    expect(publicList.body.volunteers[0]).toMatchObject({
      name: 'Unit Volunteer',
      status: 'approved',
    });
  });

  it('allows admins to reject an application', async () => {
    const { res } = await seedApplication();
    const id = res.body.application.id;

    const reject = await request(app)
      .patch(`/api/volunteers/${id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', notes: 'Incomplete documentation' });

    expect(reject.status).toBe(200);
    expect(reject.body.application.status).toBe('rejected');

    const pending = await request(app)
      .get('/api/volunteers/applications')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pending.body.applications).toHaveLength(0);

    const publicList = await request(app).get('/api/volunteers');
    expect(publicList.body.volunteers).toHaveLength(0);
  });

  it('guards admin endpoints when token is missing or invalid', async () => {
    const noToken = await request(app).get('/api/volunteers/applications');
    expect(noToken.status).toBe(401);

    const badToken = await request(app)
      .get('/api/volunteers/applications')
      .set('Authorization', 'Bearer malformed');
    expect(badToken.status).toBe(401);
  });
});
