import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule } from '@nestjs/swagger';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import * as path from 'path';
import request from 'supertest';
import {
  GenericContainer,
  Network,
  Wait,
  type StartedNetwork,
  type StartedTestContainer,
} from 'testcontainers';
import { buildOpenApiDocument } from '../src/docs/build-openapi-document';

jest.setTimeout(240_000);

const SEEDED_USERNAME = 'testuser';
const SEEDED_PASSWORD = 'Petstore123!';

describe('User API (e2e)', () => {
  let network: StartedNetwork;
  let postgres: StartedPostgreSqlContainer;
  let valkey: StartedTestContainer;
  let app: INestApplication;

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
    process.env.API_KEY_TTL_SECONDS = '2';
    // Unused by the test (supertest talks to app.getHttpServer() directly,
    // app.listen() is never called) — just needs to satisfy env validation.
    process.env.PORT = '3000';

    // Imported dynamically, after the env vars above are set: AppModule's
    // `ConfigModule.forRoot({ validate })` call runs as soon as the module is
    // evaluated, so a static top-of-file import would validate against an
    // empty process.env before beforeAll ever runs.
    const { AppModule } = await import('../src/app.module');
    const { HttpExceptionFilter } = await import('../src/common/filters/http-exception.filter');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    SwaggerModule.setup('docs', app, buildOpenApiDocument());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await valkey?.stop();
    await postgres?.stop();
    await network?.stop();
  });

  async function login(username: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .get('/user/login')
      .query({ username, password })
      .expect(200);
    return response.body as string;
  }

  describe('API Documentation (Swagger UI)', () => {
    it('serves the interactive docs page', async () => {
      const response = await request(app.getHttpServer()).get('/docs').expect(200);
      expect(response.headers['content-type']).toMatch(/text\/html/);
    });

    it('serves the exact document used to build the page, matching the committed contract', async () => {
      const response = await request(app.getHttpServer()).get('/docs-json').expect(200);
      expect(response.body).toEqual(buildOpenApiDocument());

      const protectedPaths = response.body.paths['/user/{username}'];
      expect(protectedPaths.get.security).toEqual([{ api_key: [] }]);
      expect(protectedPaths.put.security).toEqual([{ api_key: [] }]);
      expect(protectedPaths.delete.security).toEqual([{ api_key: [] }]);
      expect(response.body.paths['/user/logout'].get.security).toEqual([{ api_key: [] }]);
      expect(response.body.paths['/user'].post.security).toBeUndefined();
      expect(response.body.paths['/user/login'].get.security).toBeUndefined();
    });
  });

  describe('User Story 1 — authenticate and receive an API key', () => {
    it('issues an API key for the seeded test account on correct credentials', async () => {
      const apiKey = await login(SEEDED_USERNAME, SEEDED_PASSWORD);
      expect(typeof apiKey).toBe('string');
      expect(apiKey.length).toBeGreaterThan(0);
    });

    it('refuses an unknown username', async () => {
      await request(app.getHttpServer())
        .get('/user/login')
        .query({ username: 'nobody-here', password: 'whatever' })
        .expect(400);
    });

    it('refuses a wrong password with the same status as an unknown username', async () => {
      await request(app.getHttpServer())
        .get('/user/login')
        .query({ username: SEEDED_USERNAME, password: 'wrong-password' })
        .expect(400);
    });
  });

  describe('User Story 2 — manage a user account', () => {
    const username = 'quickstart-user';
    const password = 'Str0ngPass!23';

    it('creates, reads, updates, and deletes an account', async () => {
      const created = await request(app.getHttpServer())
        .post('/user')
        .send({ username, password, email: 'qs@example.com' })
        .expect(200);
      expect(created.body.username).toBe(username);
      expect(created.body.password).toBeUndefined();

      await request(app.getHttpServer())
        .post('/user')
        .send({ username: ' Quickstart-User ', password })
        .expect(409);

      await request(app.getHttpServer()).get(`/user/${username}`).expect(401);

      const apiKey = await login(username, password);

      const fetched = await request(app.getHttpServer())
        .get(`/user/${username}`)
        .set('api_key', apiKey)
        .expect(200);
      expect(fetched.body.email).toBe('qs@example.com');
      expect(fetched.body.password).toBeUndefined();

      const updated = await request(app.getHttpServer())
        .put(`/user/${username}`)
        .set('api_key', apiKey)
        .send({ phone: '555-0100' })
        .expect(200);
      expect(updated.body.phone).toBe('555-0100');

      await request(app.getHttpServer())
        .delete(`/user/${username}`)
        .set('api_key', apiKey)
        .expect(200);

      // The guard re-checks account existence (FR-011): the same key, now
      // orphaned by the deletion, is rejected rather than reaching a 404.
      await request(app.getHttpServer())
        .get(`/user/${username}`)
        .set('api_key', apiKey)
        .expect(401);
    });

    it('returns 404 for an unknown username on a protected route', async () => {
      const apiKey = await login(SEEDED_USERNAME, SEEDED_PASSWORD);
      await request(app.getHttpServer())
        .get('/user/does-not-exist')
        .set('api_key', apiKey)
        .expect(404);
    });
  });

  describe('User Story 3 — end a session / let it expire', () => {
    it('immediately invalidates the key on logout', async () => {
      const apiKey = await login(SEEDED_USERNAME, SEEDED_PASSWORD);

      await request(app.getHttpServer())
        .get('/user/logout')
        .set('api_key', apiKey)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/user/${SEEDED_USERNAME}`)
        .set('api_key', apiKey)
        .expect(401);
    });

    it('expires the key on its own once the TTL window elapses', async () => {
      const apiKey = await login(SEEDED_USERNAME, SEEDED_PASSWORD);

      await request(app.getHttpServer())
        .get(`/user/${SEEDED_USERNAME}`)
        .set('api_key', apiKey)
        .expect(200);

      // API_KEY_TTL_SECONDS is overridden to 2s for this suite (research.md §10).
      await new Promise((resolve) => setTimeout(resolve, 2_500));

      await request(app.getHttpServer())
        .get(`/user/${SEEDED_USERNAME}`)
        .set('api_key', apiKey)
        .expect(401);
    });
  });

  describe('User Story 4 — register several accounts at once', () => {
    it('creates every account in a non-conflicting batch', async () => {
      const batch = [
        { username: 'bulk-user-1', password: 'Str0ngPass!23' },
        { username: 'bulk-user-2', password: 'Str0ngPass!24' },
      ];

      const response = await request(app.getHttpServer())
        .post('/user/createWithList')
        .send(batch)
        .expect(200);
      expect(response.body.map((user: { username: string }) => user.username)).toEqual([
        'bulk-user-1',
        'bulk-user-2',
      ]);

      const apiKey = await login(SEEDED_USERNAME, SEEDED_PASSWORD);
      for (const { username } of batch) {
        await request(app.getHttpServer())
          .get(`/user/${username}`)
          .set('api_key', apiKey)
          .expect(200);
      }
    });

    it('creates none of a batch containing an internal username collision (FR-016/SC-005)', async () => {
      const batch = [
        { username: 'bulk-rollback-1', password: 'Str0ngPass!23' },
        { username: ' Bulk-Rollback-1 ', password: 'Str0ngPass!24' },
      ];

      await request(app.getHttpServer()).post('/user/createWithList').send(batch).expect(409);

      const apiKey = await login(SEEDED_USERNAME, SEEDED_PASSWORD);
      await request(app.getHttpServer())
        .get('/user/bulk-rollback-1')
        .set('api_key', apiKey)
        .expect(404);
    });
  });
});
