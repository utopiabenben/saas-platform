import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // Express JSON cannot serialize BigInt by default
  (BigInt.prototype as unknown as { toJSON?: () => string }).toJSON = function () {
    return this.toString();
  };

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({ origin: true, credentials: true });

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
  console.log(`platform-api listening on http://localhost:${port}/api/v1`);
}
bootstrap();
