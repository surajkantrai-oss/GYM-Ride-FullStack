import { Global, Module } from '@nestjs/common';
import { PasswordHasher } from './security/password-hasher';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Global()
@Module({
  providers: [PasswordHasher, JwtAuthGuard, RolesGuard],
  exports: [PasswordHasher, JwtAuthGuard, RolesGuard],
})
export class CommonModule {}
