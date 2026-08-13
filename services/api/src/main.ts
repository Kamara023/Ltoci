import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpErrorFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  // CORS : liste blanche d'origines (le front navigateur appelle l'API
  // cross-origin ; les pages server-rendered n'y sont pas soumises).
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3002,http://localhost:3003')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Admin-Token', 'X-Request-Id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 86400,
  });
  app.use(requestIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpErrorFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('LotoStats API')
    .setDescription(
      "API d'analyse statistique des jeux de loterie en Côte d'Ivoire (Loto Bonheur LONACI). " +
        'Les tirages sont aléatoires et indépendants : aucune donnée exposée par cette API ne ' +
        'constitue une prédiction ni ne modifie les probabilités de gain.',
    )
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
