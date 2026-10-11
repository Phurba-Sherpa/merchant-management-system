import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

export function configureApp(app: INestApplication): void {
  // Security headers via Helmet
  app.use(helmet());

  // Pino structured logging
  app.useLogger(app.get(Logger));

  // Global validation pipe rejecting unwhitelisted fields (mass assignment prevention)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter for unified JSON error format and internal masking
  app.useGlobalFilters(new AllExceptionsFilter());

  // Graceful shutdown
  app.enableShutdownHooks();

  // Swagger documentation at /docs
  const config = new DocumentBuilder()
    .setTitle('Merchant Applications API')
    .setDescription(
      'Merchant application lifecycle, auth, and risk management API',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
