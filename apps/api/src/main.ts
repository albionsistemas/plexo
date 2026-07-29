/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import 'dotenv/config';
import 'reflect-metadata';
import { join } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  await app.register(multipart, { limits: { fileSize: 5_000_000 } });
  // Serves uploaded article images (see ArticleImageService) unauthenticated,
  // from a random-uuid filename rather than a tenantId-scoped path - a
  // deliberate, narrow exception to "everything is RLS/tenant-protected"
  // (product photos aren't fiscal/financial data), documented in
  // Article.imageUrl's schema comment. First real file-storage feature in
  // the project - `uploads/` lives at the repo root, gitignored.
  await app.register(fastifyStatic, {
    root: join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
  });
  app.enableCors({ origin: ['http://localhost:4200', 'http://localhost:3000'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
