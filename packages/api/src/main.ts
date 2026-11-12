import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import type { EnvConfig } from './config/env.validation';
import { buildOpenApiDocument } from './docs/build-openapi-document';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // The uploadFile operation's body is raw application/octet-stream, not
  // JSON/urlencoded — register a route-scoped raw-body parser ahead of
  // Nest's routing (research.md §7).
  app.use(
    '/pet/:petId/uploadImage',
    express.raw({ type: 'application/octet-stream', limit: '10mb' }),
  );

  // Serves uploaded pet images back out (research.md §8). packages/api/uploads
  // — src (dev) and dist (built) are both one level under packages/api/.
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  SwaggerModule.setup('docs', app, buildOpenApiDocument());

  const config = app.get(ConfigService<EnvConfig, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

bootstrap();
