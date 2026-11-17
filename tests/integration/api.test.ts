import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '@/src/server/app';
import {
  setDbForTests,
  setPublicQueryExecutorForTests,
  type AppDb,
} from '@/src/server/db';
import { loginAttempts } from '@/src/server/db/schema';
import { hashPasswordScrypt } from '@/src/server/services/admin-auth.service';
import { resetStorageProviderForTests } from '@/src/server/services/storage';
import { hashPublicToken } from '@/src/server/services/token.service';

function createLoginAttemptsDbMock() {
  const attempts: Array<{ ipHash: string; attemptedAt: Date }> = [];

  const mockDb = {
    select: () => ({
      from: (table: unknown) => {
        if (table === loginAttempts) {
          return {
            where: async () => [{ total: attempts.length }],
          };
        }
        return { where: async () => [] };
      },
    }),
    insert: (table: unknown) => ({
      values: async (vals: { ipHash: string }) => {
        if (table === loginAttempts) {
          attempts.push({ ipHash: vals.ipHash, attemptedAt: new Date() });
        }
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        if (table === loginAttempts) {
          attempts.length = 0;
        }
      },
    }),
  };

  return { mockDb: mockDb as unknown as AppDb, attempts };
}

describe('API REST CascoQR — Login propio, login_attempts, funciones SECURITY DEFINER y validaciones', () => {
  let app: ReturnType<typeof createApiApp>;
  let samplePngBuffer: Buffer;
  const origEnv = { ...process.env };

  beforeAll(async () => {
    samplePngBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 240, g: 244, b: 248 },
      },
    })
      .png()
      .toBuffer();

    app = createApiApp();
  });

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_PUBLIC_URL;
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.SESSION_SECRET;
    delete process.env.STORAGE_DRIVER;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    setDbForTests(null);
    setPublicQueryExecutorForTests(null);
    resetStorageProviderForTests();
  });

  afterEach(() => {
    process.env = { ...origEnv };
    setDbForTests(null);
    setPublicQueryExecutorForTests(null);
    resetStorageProviderForTests();
  });

  it('expone estado de configuración en /api/v1/auth/config sin filtrar secretos', async () => {
    const unconfigured = await request(app).get('/api/v1/auth/config');
    expect(unconfigured.status).toBe(200);
    expect(unconfigured.body).toEqual({
      authConfigured: false,
      dbConfigured: false,
      storageConfigured: false,
    });

    process.env.DATABASE_URL =
      'postgresql://cascoqr_admin_app:secret@ep-wandering-water-bdrfb5k6-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('SuperSecret123!');
    process.env.R2_ACCESS_KEY_ID = 'r2-access-key-test';
    process.env.R2_SECRET_ACCESS_KEY = 'r2-secret-key-test';

    const configured = await request(app).get('/api/v1/auth/config');
    expect(configured.status).toBe(200);
    expect(configured.body).toEqual({
      authConfigured: true,
      dbConfigured: true,
      storageConfigured: true,
    });
  });

  it('autentica al usuario admin único con scrypt, protege fuerza bruta en login_attempts y valida sesión', async () => {
    process.env.DATABASE_URL =
      'postgresql://cascoqr_admin_app:secret@ep-wandering-water-bdrfb5k6-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require';
    process.env.ADMIN_USERNAME = 'casco_admin';
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('MiClaveSegura2026!');
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    const { mockDb, attempts } = createLoginAttemptsDbMock();
    setDbForTests(mockDb);

    // Unauthenticated requests blocked with 401
    const unauth = await request(app).get('/api/v1/owners');
    expect(unauth.status).toBe(401);

    // 8 failed attempts -> recorded with HMAC IP hash, 9th blocked with 429
    for (let i = 0; i < 8; i += 1) {
      const bad = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'casco_admin', password: 'wrong-password' });
      expect(bad.status).toBe(401);
    }
    expect(attempts).toHaveLength(8);
    expect(attempts[0].ipHash).toMatch(/^[0-9a-f]{64}$/);

    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'casco_admin', password: 'MiClaveSegura2026!' });
    expect(blocked.status).toBe(429);

    // Clear lockout and verify successful login + Bearer/Cookie session
    attempts.length = 0;
    const agent = request.agent(app);
    const loginOk = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'casco_admin', password: 'MiClaveSegura2026!' });
    expect(loginOk.status).toBe(200);
    expect(loginOk.body.admin).toEqual({ username: 'casco_admin' });
    expect(loginOk.body.sessionToken).toBeTruthy();

    const meByCookie = await agent.get('/api/v1/auth/me');
    expect(meByCookie.status).toBe(200);
    expect(meByCookie.body.admin).toEqual({ username: 'casco_admin' });

    const meByBearer = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginOk.body.sessionToken}`);
    expect(meByBearer.status).toBe(200);
  });

  it('consulta ficha pública exclusivamente a través de funciones SECURITY DEFINER por hash SHA-256', async () => {
    const validToken = 'Tok3nPubl1c0Val1d0_1234567890abcd';
    const expectedHash = hashPublicToken(validToken);

    setPublicQueryExecutorForTests({
      async getCardByHash(hash) {
        if (hash !== expectedHash) return null;
        return {
          owner_id: '00000000-0000-4000-8000-000000000010',
          first_name: 'Carlos',
          last_name: 'Mendoza',
          email: 'carlos@moto.mx',
          phone: '+52 55 1234 5678',
          template_storage_key: 'templates/tpl-1.png',
          template_mime: 'image/png',
          template_width: 1200,
          template_height: 600,
          qr_x: '65.00',
          qr_y: '20.00',
          qr_width: '20.00',
          qr_height: '40.00',
        };
      },
      async getDocumentsByHash(hash) {
        if (hash !== expectedHash) return [];
        return [
          {
            document_id: '00000000-0000-4000-8000-000000000020',
            original_name: 'licencia.png',
            mime_type: 'image/png',
          },
        ];
      },
      async getDocumentFile() {
        return null;
      },
    });

    const pubOk = await request(app).get(`/api/v1/public/${validToken}`);
    expect(pubOk.status).toBe(200);
    expect(pubOk.body.card).toEqual({
      fullName: 'Carlos Mendoza',
      email: 'carlos@moto.mx',
      phone: '+52 55 1234 5678',
      documents: [
        {
          id: '00000000-0000-4000-8000-000000000020',
          originalName: 'licencia.png',
          mimeType: 'image/png',
        },
      ],
    });

    const pubMissing = await request(app).get('/api/v1/public/OtroTokenNoVigente_1234567890abcd');
    expect(pubMissing.status).toBe(404);
  });

  it('valida magic bytes de archivos, UUIDs, tamaño mínimo 5% y devuelve 503 si faltan llaves R2', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'SecretPassword123!' });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.sessionToken as string;

    // Fake PNG rejected with 400
    const fakeTpl = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Plantilla Falsa')
      .attach('image', Buffer.from('not-a-png'), 'fake.png');
    expect(fakeTpl.status).toBe(400);

    // Invalid UUID on label update rejected with 400
    const invalidUuid = await request(app)
      .put('/api/v1/owners/not-a-uuid/label')
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateId: '00000000-0000-4000-8000-000000000002',
        x: 10,
        y: 10,
        width: 20,
        height: 20,
      });
    expect(invalidUuid.status).toBe(400);

    // Width < 5% rejected with 400 matching enforce_label_square trigger
    const tooSmallQr = await request(app)
      .put('/api/v1/owners/00000000-0000-4000-8000-000000000010/label')
      .set('Authorization', `Bearer ${token}`)
      .send({
        templateId: '00000000-0000-4000-8000-000000000002',
        x: 10,
        y: 10,
        width: 3,
        height: 3,
      });
    expect(tooSmallQr.status).toBe(400);

    // Valid PNG upload without R2 credentials returns 503
    const missingR2Tpl = await request(app)
      .post('/api/v1/templates')
      .set('Authorization', `Bearer ${token}`)
      .field('name', 'Plantilla Sin R2')
      .attach('image', samplePngBuffer, 'valid.png');
    expect(missingR2Tpl.status).toBe(503);
  });
});
