import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as express from 'express';
import * as path from 'path';
import request from 'supertest';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';

jest.setTimeout(240_000);

const SEEDED_USERNAME = 'testuser';
const SEEDED_PASSWORD = 'Petstore123!';

describe('Pet & Store API (e2e)', () => {
  let network: StartedNetwork;
  let postgres: StartedPostgreSqlContainer;
  let valkey: StartedTestContainer;
  let app: NestExpressApplication;
  let apiKey: string;

  beforeAll(async () => {
    network = await new Network().start();

    postgres = await new PostgreSqlContainer('postgres:16')
      .withNetwork(network)
      .withNetworkAliases('postgres')
      .withUsername('petstore')
      .withPassword('petstore')
      .withDatabase('petstore')
      .start();

    const migrationsPath = path.resolve(__dirname, '../migrations');
    const liquibase = await new GenericContainer('liquibase/liquibase:4.29')
      .withNetwork(network)
      .withBindMounts([{ source: migrationsPath, target: '/liquibase/changelog' }])
      .withCommand([
        '--changelog-file=changelog/db.changelog-master.yaml',
        '--url=jdbc:postgresql://postgres:5432/petstore',
        '--username=petstore',
        '--password=petstore',
        'update',
      ])
      .withWaitStrategy(Wait.forLogMessage(/successfully/i))
      .withStartupTimeout(120_000)
      .start();
    await liquibase.stop();

    valkey = await new GenericContainer('valkey/valkey:8-alpine')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start();

    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.VALKEY_URL = `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`;
    process.env.API_KEY_TTL_SECONDS = '1800';
    process.env.PORT = '3000';

    const { AppModule } = await import('../src/app.module');
    const { HttpExceptionFilter } = await import('../src/common/filters/http-exception.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    // Mirrors main.ts's bootstrap() — bypassed here since the app is built
    // directly from the module, not via bootstrap().
    app.use(
      '/pet/:petId/uploadImage',
      express.raw({ type: 'application/octet-stream', limit: '10mb' }),
    );
    app.useStaticAssets(path.join(__dirname, '../uploads'), { prefix: '/uploads' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const loginResponse = await request(app.getHttpServer())
      .get('/user/login')
      .query({ username: SEEDED_USERNAME, password: SEEDED_PASSWORD })
      .expect(200);
    apiKey = loginResponse.body as string;
  });

  afterAll(async () => {
    await app?.close();
    await valkey?.stop();
    await postgres?.stop();
    await network?.stop();
  });

  describe('User Story 1 — manage the pet catalog', () => {
    it('creates, reads, updates, and deletes a pet', async () => {
      const created = await request(app.getHttpServer())
        .post('/pet')
        .set('api_key', apiKey)
        .send({
          name: 'Rex',
          photoUrls: ['https://example.com/rex.jpg'],
          category: { name: 'Dogs' },
          tags: [{ name: 'friendly' }],
          status: 'available',
        })
        .expect(200);
      expect(created.body.name).toBe('Rex');
      expect(created.body.category).toMatchObject({ name: 'Dogs' });
      expect(created.body.tags).toEqual([expect.objectContaining({ name: 'friendly' })]);
      const petId = created.body.id as number;

      await request(app.getHttpServer()).get(`/pet/${petId}`).expect(401);

      const fetched = await request(app.getHttpServer())
        .get(`/pet/${petId}`)
        .set('api_key', apiKey)
        .expect(200);
      expect(fetched.body.photoUrls).toEqual(['https://example.com/rex.jpg']);

      const updated = await request(app.getHttpServer())
        .put('/pet')
        .set('api_key', apiKey)
        .send({ id: petId, name: 'Rex', photoUrls: ['https://example.com/rex.jpg'], status: 'pending' })
        .expect(200);
      expect(updated.body.status).toBe('pending');

      await request(app.getHttpServer())
        .delete(`/pet/${petId}`)
        .set('api_key', apiKey)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/pet/${petId}`)
        .set('api_key', apiKey)
        .expect(404);
    });

    it('returns 404 for an unknown pet id', async () => {
      await request(app.getHttpServer())
        .get('/pet/999999999')
        .set('api_key', apiKey)
        .expect(404);
    });
  });

  describe('User Story 2 — find a pet to buy', () => {
    let petId: number;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/pet')
        .set('api_key', apiKey)
        .send({
          name: 'Discovery Pet',
          photoUrls: ['https://example.com/discovery.jpg'],
          tags: [{ name: 'discoverable' }],
          status: 'sold',
        })
        .expect(200);
      petId = created.body.id as number;
    });

    it('finds pets by status, returning only matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/pet/findByStatus')
        .query({ status: 'sold' })
        .set('api_key', apiKey)
        .expect(200);
      expect(response.body.map((pet: { id: number }) => pet.id)).toContain(petId);
      expect(
        (response.body as { status: string }[]).every((pet) => pet.status === 'sold'),
      ).toBe(true);
    });

    it('finds pets by tag, returning only matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/pet/findByTags')
        .query({ tags: 'discoverable' })
        .set('api_key', apiKey)
        .expect(200);
      expect(response.body.map((pet: { id: number }) => pet.id)).toEqual([petId]);
    });

    it('uploads an image, which then appears among the pet’s photos', async () => {
      const upload = await request(app.getHttpServer())
        .post(`/pet/${petId}/uploadImage`)
        .set('api_key', apiKey)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('fake-image-bytes'))
        .expect(200);
      expect(upload.body.message).toContain(`pet ${petId}`);

      const fetched = await request(app.getHttpServer())
        .get(`/pet/${petId}`)
        .set('api_key', apiKey)
        .expect(200);
      expect(fetched.body.photoUrls).toEqual([
        'https://example.com/discovery.jpg',
        expect.stringMatching(new RegExp(`^/uploads/${petId}/`)),
      ]);

      const uploadedUrl = fetched.body.photoUrls[1] as string;
      const served = await request(app.getHttpServer()).get(uploadedUrl).expect(200);
      expect(served.body as Buffer).toEqual(Buffer.from('fake-image-bytes'));
    });
  });

  describe('User Story 3 — place and manage an order', () => {
    let petId: number;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/pet')
        .set('api_key', apiKey)
        .send({
          name: 'Orderable Pet',
          photoUrls: ['https://example.com/orderable.jpg'],
          status: 'available',
        })
        .expect(200);
      petId = created.body.id as number;
    });

    it('places, retrieves, and deletes an order', async () => {
      const placed = await request(app.getHttpServer())
        .post('/store/order')
        .send({ petId, quantity: 1 })
        .expect(200);
      expect(placed.body).toMatchObject({ petId, quantity: 1, status: 'placed' });
      const orderId = placed.body.id as number;

      const fetched = await request(app.getHttpServer())
        .get(`/store/order/${orderId}`)
        .expect(200);
      expect(fetched.body).toMatchObject({ id: orderId, petId });

      await request(app.getHttpServer()).delete(`/store/order/${orderId}`).expect(200);

      await request(app.getHttpServer()).get(`/store/order/${orderId}`).expect(404);
    });

    it('refuses an order for a nonexistent pet', async () => {
      await request(app.getHttpServer())
        .post('/store/order')
        .send({ petId: 999999999, quantity: 1 })
        .expect(404);
    });

    it('reflects current pet statuses in the inventory summary', async () => {
      const response = await request(app.getHttpServer())
        .get('/store/inventory')
        .set('api_key', apiKey)
        .expect(200);
      expect(response.body.available).toBeGreaterThanOrEqual(1);
    });
  });
});
