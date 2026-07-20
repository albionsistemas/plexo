import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env['JWT_SECRET'];
        if (!secret) {
          throw new Error('JWT_SECRET is not set');
        }
        return {
          secret,
          signOptions: { expiresIn: process.env['JWT_EXPIRES_IN'] ?? '8h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
