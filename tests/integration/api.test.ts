import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApiApp } from '@/src/server/app';
import {
  setDbForTests,
  setPublicQueryExecutorForTests,
  type AppDb,
} from '@/src/server/db';
import { loginAttempts, ownerDocuments, owners } from '@/src/server/db/schema';
import { hashPasswordScrypt } from '@/src/server/services/admin-auth.service';
import { getStorageProvider, resetStorageProviderForTests } from '@/src/server/services/storage';
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

  it('consulta ficha pública exclusivamente a través de funciones SECURITY DEFINER por hash SHA-256 y registra escaneos sin duplicar', async () => {
    const validToken = 'Tok3nPubl1c0Val1d0_1234567890abcd';
    const expectedHash = hashPublicToken(validToken);
    let recordedScans = 0;

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
      async recordScanByHash(hash) {
        if (hash === expectedHash) {
          recordedScans += 1;
        }
      },
      async getCardTheme() {
        return {
          theme: {
            brandName: 'MotoClub MX',
            subtitleText: 'Identificación',
            headerColor: '#1E293B',
            headerHeight: 190,
            logoX: 25,
            logoY: 85,
            logoSize: 96,
          },
          logo_storage_key: null,
          logo_mime_type: null,
        };
      },
      async getOwnerThemeOverrideByHash(hash) {
        if (hash !== expectedHash) return null;
        return {
          useGlobalTheme: false,
          headerColor: '#DC2626',
          subtitleText: 'Capitán',
        };
      },
      async getOwnerEmergencyByHash(hash) {
        if (hash !== expectedHash) return null;
        return {
          birthDate: '1994-06-15',
          bloodType: 'O+',
          organDonor: 'yes',
          cityState: 'CDMX',
          contact1: {
            name: 'Martha Mendoza',
            phone: '+52 55 9876 5432',
            relationship: 'mama',
            relationshipCustom: '',
          },
          contact2: {
            name: 'Luis Mendoza',
            phone: '+52 55 1122 3344',
            relationship: 'hermano',
            relationshipCustom: '',
          },
          allergies: { noneKnown: false, selected: ['Penicilina'], custom: [] },
          conditions: { noneKnown: false, selected: ['Diabetes (azúcar)'], custom: ['Rinitis'] },
          medications: { noneKnown: false, items: ['Metformina 850 mg'] },
          insurance: { institution: 'IMSS', nss: '12345678901', policyNumber: '', clinic: 'UMF 1' },
          rescueNotes: 'Alergia severa a penicilina',
        };
      },
    });

    const pubOk = await request(app).get(`/api/v1/public/${validToken}`);
    expect(pubOk.status).toBe(200);
    expect(recordedScans).toBe(1);
    expect(pubOk.body.card).toEqual({
      fullName: 'Carlos Mendoza',
      email: 'carlos@moto.mx',
      phone: '+52 55 1234 5678',
      emergencyProfile: {
        birthDate: '1994-06-15',
        bloodType: 'O+',
        organDonor: 'yes',
        cityState: 'CDMX',
        contact1: {
          name: 'Martha Mendoza',
          phone: '+52 55 9876 5432',
          relationship: 'mama',
          relationshipCustom: '',
        },
        contact2: {
          name: 'Luis Mendoza',
          phone: '+52 55 1122 3344',
          relationship: 'hermano',
          relationshipCustom: '',
        },
        allergies: { noneKnown: false, selected: ['Penicilina'], custom: [] },
        conditions: { noneKnown: false, selected: ['Diabetes (azúcar)'], custom: ['Rinitis'] },
        medications: { noneKnown: false, items: ['Metformina 850 mg'] },
        insurance: { institution: 'IMSS', nss: '12345678901', policyNumber: '', clinic: 'UMF 1' },
        rescueNotes: 'Alergia severa a penicilina',
      },
      documents: [
        {
          id: '00000000-0000-4000-8000-000000000020',
          originalName: 'licencia.png',
          mimeType: 'image/png',
        },
      ],
    });
    expect(pubOk.body.theme).toMatchObject({
      brandName: 'MotoClub MX',
      headerHeight: 190,
      logoX: 25,
      logoY: 85,
      logoSize: 96,
      headerColor: '#DC2626',
      subtitleText: 'Capitán',
    });

    const pubMissing = await request(app).get('/api/v1/public/OtroTokenNoVigente_1234567890abcd');
    expect(pubMissing.status).toBe(404);
    expect(recordedScans).toBe(1);

    // Requesting sub-resources does not double-count scans
    await request(app).get(`/api/v1/public/${validToken}/label-image`);
    expect(recordedScans).toBe(1);
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

  it('retorna estadísticas reales del padrón en GET /api/v1/owners sin requerir tablas adicionales', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    const mockOwnersDb = {
      select: (fields: Record<string, unknown>) => ({
        from: () => {
          if ('totalOwners' in fields) {
            return Promise.resolve([
              {
                totalOwners: 5,
                activeOwners: 4,
                inactiveOwners: 1,
                totalScans: 19,
                totalLabels: 5,
                totalTemplates: 2,
                totalDocuments: 7,
              },
            ]);
          }
          return {
            leftJoin: () => ({
              leftJoin: () => ({
                where: () => ({
                  orderBy: async () => [],
                }),
              }),
            }),
          };
        },
      }),
    };
    setDbForTests(mockOwnersDb as unknown as AppDb);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'SecretPassword123!' });
    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .get('/api/v1/owners?status=active')
      .set('Authorization', `Bearer ${loginRes.body.sessionToken}`);

    expect(res.status).toBe(200);
    expect(res.body.owners).toEqual([]);
    expect(res.body.stats).toEqual({
      totalOwners: 5,
      activeOwners: 4,
      inactiveOwners: 1,
      totalScans: 19,
      totalLabels: 5,
      totalTemplates: 2,
      totalDocuments: 7,
    });
  });

  it('valida parámetros de POST /api/v1/labels/print-sheet', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'SecretPassword123!' });
    const token = loginRes.body.sessionToken as string;

    const emptyRes = await request(app)
      .post('/api/v1/labels/print-sheet')
      .set('Authorization', `Bearer ${token}`)
      .send({ ownerIds: [], paperSize: 'letter', columns: 3 });
    expect(emptyRes.status).toBe(400);

    const tooManyIds = Array.from(
      { length: 21 },
      (_, idx) => `550e8400-e29b-41d4-a716-4466554400${String(idx).padStart(2, '0')}`,
    );
    const tooManyRes = await request(app)
      .post('/api/v1/labels/print-sheet')
      .set('Authorization', `Bearer ${token}`)
      .send({ ownerIds: tooManyIds, paperSize: 'tabloid', columns: 4 });
    expect(tooManyRes.status).toBe(400);
  });

  it('valida parámetros en PUT /api/v1/card-theme y exige sesión admin', async () => {
    const unauth = await request(app).get('/api/v1/card-theme');
    expect(unauth.status).toBe(401);

    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'SecretPassword123!' });
    const token = loginRes.body.sessionToken as string;

    const badHex = await request(app)
      .put('/api/v1/card-theme')
      .set('Authorization', `Bearer ${token}`)
      .send({
        brandName: 'CascoQR',
        headerColor: 'naranja',
        headerHeight: 160,
      });
    expect(badHex.status).toBe(400);

    const badHeight = await request(app)
      .put('/api/v1/card-theme')
      .set('Authorization', `Bearer ${token}`)
      .send({
        brandName: 'CascoQR',
        headerColor: '#F97316',
        headerHeight: 500,
      });
    expect(badHeight.status).toBe(400);
  });

  it('guarda y restablece el diseño completo individual en PUT /api/v1/owners/:id/card-theme', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    let storedOverride: unknown = null;
    const ownerId = '550e8400-e29b-41d4-a716-446655440000';

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: ownerId }],
          }),
        }),
      }),
      update: () => ({
        set: (values: { cardThemeOverride?: unknown }) => ({
          where: async () => {
            storedOverride = values.cardThemeOverride ?? null;
          },
        }),
      }),
    };
    setDbForTests(mockDb as unknown as AppDb);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'SecretPassword123!' });
    const token = loginRes.body.sessionToken as string;

    const badUuid = await request(app)
      .put('/api/v1/owners/no-es-uuid/card-theme')
      .set('Authorization', `Bearer ${token}`)
      .send({ useGlobalTheme: false, headerColor: '#2563EB' });
    expect(badUuid.status).toBe(400);

    const badOverride = await request(app)
      .put(`/api/v1/owners/${ownerId}/card-theme`)
      .set('Authorization', `Bearer ${token}`)
      .send({ useGlobalTheme: false, headerHeight: 999 });
    expect(badOverride.status).toBe(400);

    const saveOk = await request(app)
      .put(`/api/v1/owners/${ownerId}/card-theme`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        useGlobalTheme: false,
        brandName: 'Casco Elite',
        headerColor: '#2563EB',
        headerHeight: 220,
        logoX: 75,
        logoY: 60,
        logoSize: 90,
        logoShape: 'rounded',
        pageBg: 'warm',
        footerNote: 'Nota individual',
      });
    expect(saveOk.status).toBe(200);
    expect(saveOk.body.hasCustomCardTheme).toBe(true);
    expect(saveOk.body.cardThemeOverride).toMatchObject({
      useGlobalTheme: false,
      brandName: 'Casco Elite',
      headerColor: '#2563EB',
      headerHeight: 220,
      logoX: 75,
      logoY: 60,
      logoSize: 90,
      logoShape: 'rounded',
      pageBg: 'warm',
      footerNote: 'Nota individual',
    });
    expect(storedOverride).toMatchObject({ headerHeight: 220, logoX: 75 });

    const resetOk = await request(app)
      .put(`/api/v1/owners/${ownerId}/card-theme`)
      .set('Authorization', `Bearer ${token}`)
      .send({ useGlobalTheme: true });
    expect(resetOk.status).toBe(200);
    expect(resetOk.body).toEqual({
      cardThemeOverride: null,
      hasCustomCardTheme: false,
    });
    expect(storedOverride).toBeNull();
  });

  it('valida datos médicos, contactos de emergencia y NSS en PUT /api/v1/owners/:id', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';

    const ownerId = '550e8400-e29b-41d4-a716-446655440099';
    let savedEmergency: unknown = null;

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: ownerId }],
          }),
        }),
      }),
      update: () => ({
        set: (values: { emergencyProfile?: unknown }) => ({
          where: async () => {
            savedEmergency = values.emergencyProfile ?? null;
          },
        }),
      }),
    };
    setDbForTests(mockDb as unknown as AppDb);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'SecretPassword123!' });
    const token = loginRes.body.sessionToken as string;

    const invalidPhone = await request(app)
      .put(`/api/v1/owners/${ownerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Carlos',
        lastName: 'Mendoza',
        emergencyProfile: {
          contact1: { name: 'Ana', phone: 'no-valido', relationship: 'mama' },
        },
      });
    expect(invalidPhone.status).toBe(400);

    const validUpdate = await request(app)
      .put(`/api/v1/owners/${ownerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Carlos',
        lastName: 'Mendoza',
        emergencyProfile: {
          birthDate: '1994-06-15',
          bloodType: 'O+',
          organDonor: 'yes',
          contact1: { name: 'Martha Ruiz', phone: '+52 55 1234 5678', relationship: 'mama' },
          insurance: { institution: 'IMSS', nss: '12345678901' },
        },
      });
    expect(validUpdate.status).toBe(200);
    expect(validUpdate.body.owner.emergencyProfile).toMatchObject({
      bloodType: 'O+',
      insurance: { institution: 'IMSS', nss: '12345678901' },
    });
    expect(savedEmergency).toMatchObject({ bloodType: 'O+' });
  });

  it('elimina permanentemente al propietario y sus documentos en DELETE /api/v1/owners/:id', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
    process.env.STORAGE_DRIVER = 'local';
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cascoqr-del-'));
    process.env.LOCAL_STORAGE_DIR = tmpDir;
    resetStorageProviderForTests();

    const ownerId = '550e8400-e29b-41d4-a716-446655440123';
    const docKey1 = `documents/${ownerId}/doc-1.png`;
    const docKey2 = `documents/${ownerId}/doc-2.jpg`;
    await getStorageProvider().putObject(docKey1, samplePngBuffer, 'image/png');
    await getStorageProvider().putObject(docKey2, samplePngBuffer, 'image/jpeg');

    let ownerExists = true;
    let deletedOwnerCalled = false;

    const mockDb = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === owners) {
              return {
                limit: async () => (ownerExists ? [{ id: ownerId }] : []),
              };
            }
            if (table === ownerDocuments) {
              return Promise.resolve([
                { id: 'doc-1', storageKey: docKey1 },
                { id: 'doc-2', storageKey: docKey2 },
              ]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => {
          if (table === owners) {
            deletedOwnerCalled = true;
            ownerExists = false;
          }
        },
      }),
    };
    setDbForTests(mockDb as unknown as AppDb);

    try {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'SecretPassword123!' });
      const token = loginRes.body.sessionToken as string;

      const badUuid = await request(app)
        .delete('/api/v1/owners/invalido')
        .set('Authorization', `Bearer ${token}`);
      expect(badUuid.status).toBe(400);

      const delOk = await request(app)
        .delete(`/api/v1/owners/${ownerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delOk.status).toBe(200);
      expect(delOk.body).toEqual({ ok: true, deletedDocuments: 2 });
      expect(deletedOwnerCalled).toBe(true);

      await expect(getStorageProvider().getObject(docKey1)).rejects.toThrow();
      await expect(getStorageProvider().getObject(docKey2)).rejects.toThrow();

      const delMissing = await request(app)
        .delete(`/api/v1/owners/${ownerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delMissing.status).toBe(404);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('prioriza foto o logo individual por propietario en ficha pública y sirve /owner-logo', async () => {
    process.env.STORAGE_DRIVER = 'local';
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cascoqr-publogo-'));
    process.env.LOCAL_STORAGE_DIR = tmpDir;
    resetStorageProviderForTests();

    const tokenA = 'Tok3nPr0p1etari0ConLogo_12345678';
    const tokenB = 'Tok3nPr0p1etari0S1nLogo_12345678';
    const hashA = hashPublicToken(tokenA);
    const hashB = hashPublicToken(tokenB);

    const ownerLogoKey = 'branding/owners/owner-a/logo.png';
    const globalLogoKey = 'branding/global/logo.png';
    await getStorageProvider().putObject(ownerLogoKey, samplePngBuffer, 'image/png');
    await getStorageProvider().putObject(globalLogoKey, samplePngBuffer, 'image/png');

    setPublicQueryExecutorForTests({
      async getCardByHash(hash) {
        if (hash !== hashA && hash !== hashB) return null;
        return {
          owner_id: hash === hashA ? 'owner-a' : 'owner-b',
          first_name: hash === hashA ? 'Juan' : 'Luis',
          last_name: 'Pérez',
          email: null,
          phone: null,
          template_storage_key: 'templates/tpl.png',
          template_mime: 'image/png',
          template_width: 1000,
          template_height: 500,
          qr_x: '65',
          qr_y: '20',
          qr_width: '20',
          qr_height: '40',
        };
      },
      async getDocumentsByHash() {
        return [];
      },
      async getDocumentFile() {
        return null;
      },
      async getCardTheme() {
        return {
          theme: { brandName: 'CascoQR' },
          logo_storage_key: globalLogoKey,
          logo_mime_type: 'image/png',
          updated_at: '2026-11-23T10:00:00.000Z',
        };
      },
      async getOwnerLogoByHash(hash) {
        if (hash === hashA) {
          return {
            logo_storage_key: ownerLogoKey,
            logo_mime_type: 'image/png',
            updated_at: '2026-11-23T12:00:00.000Z',
          };
        }
        return null;
      },
    });

    try {
      const cardA = await request(app).get(`/api/v1/public/${tokenA}`);
      expect(cardA.status).toBe(200);
      expect(cardA.body.theme.hasCustomLogo).toBe(true);
      expect(cardA.body.logoUrl).toContain(`/api/v1/public/${tokenA}/owner-logo`);

      const imgA = await request(app).get(`/api/v1/public/${tokenA}/owner-logo`);
      expect(imgA.status).toBe(200);
      expect(imgA.headers['content-type']).toContain('image/png');

      const cardB = await request(app).get(`/api/v1/public/${tokenB}`);
      expect(cardB.status).toBe(200);
      expect(cardB.body.theme.hasCustomLogo).toBe(true);
      expect(cardB.body.logoUrl).toContain('/api/v1/public/theme-logo');

      const missingImgB = await request(app).get(`/api/v1/public/${tokenB}/owner-logo`);
      expect(missingImgB.status).toBe(404);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('sube, consulta, quita y limpia en almacenamiento el logo individual de un propietario', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'SecretPassword123!';
    process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
    process.env.STORAGE_DRIVER = 'local';
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cascoqr-ownerlogo-'));
    process.env.LOCAL_STORAGE_DIR = tmpDir;
    resetStorageProviderForTests();

    const ownerId = '550e8400-e29b-41d4-a716-446655440777';
    let storedLogoKey: string | null = null;
    let storedLogoMime: string | null = null;
    let ownerExists = true;

    const mockDb = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => {
            if (table === owners) {
              return {
                limit: async () =>
                  ownerExists
                    ? [
                        {
                          id: ownerId,
                          logoStorageKey: storedLogoKey,
                          logoMimeType: storedLogoMime,
                        },
                      ]
                    : [],
              };
            }
            if (table === ownerDocuments) {
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
      update: () => ({
        set: (values: { logoStorageKey?: string | null; logoMimeType?: string | null }) => ({
          where: async () => {
            if ('logoStorageKey' in values) {
              storedLogoKey = values.logoStorageKey ?? null;
              storedLogoMime = values.logoMimeType ?? null;
            }
          },
        }),
      }),
      delete: (table: unknown) => ({
        where: async () => {
          if (table === owners) {
            ownerExists = false;
          }
        },
      }),
    };
    setDbForTests(mockDb as unknown as AppDb);

    try {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'admin', password: 'SecretPassword123!' });
      const token = loginRes.body.sessionToken as string;

      const upRes = await request(app)
        .post(`/api/v1/owners/${ownerId}/card-logo`)
        .set('Authorization', `Bearer ${token}`)
        .attach('logo', samplePngBuffer, 'selfie.png');
      expect(upRes.status).toBe(200);
      expect(upRes.body.hasCustomLogo).toBe(true);
      expect(storedLogoKey).toBeTruthy();

      const firstKey = storedLogoKey!;
      const fetched = await request(app)
        .get(`/api/v1/owners/${ownerId}/card-logo`)
        .set('Authorization', `Bearer ${token}`);
      expect(fetched.status).toBe(200);
      expect(fetched.headers['content-type']).toContain('image/png');

      // Delete logo endpoint returns to global and removes storage object
      const delLogo = await request(app)
        .delete(`/api/v1/owners/${ownerId}/card-logo`)
        .set('Authorization', `Bearer ${token}`);
      expect(delLogo.status).toBe(200);
      expect(delLogo.body.hasCustomLogo).toBe(false);
      expect(storedLogoKey).toBeNull();
      await expect(getStorageProvider().getObject(firstKey)).rejects.toThrow();

      // Upload again and verify DELETE /api/v1/owners/:id also cleans up logoStorageKey
      const upSecond = await request(app)
        .post(`/api/v1/owners/${ownerId}/card-logo`)
        .set('Authorization', `Bearer ${token}`)
        .attach('logo', samplePngBuffer, 'club.png');
      expect(upSecond.status).toBe(200);
      const secondKey = storedLogoKey!;

      const delOwner = await request(app)
        .delete(`/api/v1/owners/${ownerId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(delOwner.status).toBe(200);
      await expect(getStorageProvider().getObject(secondKey)).rejects.toThrow();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
