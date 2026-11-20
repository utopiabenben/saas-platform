import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-me',
    });
  }

  validate(payload: JwtPayload) {
    return {
      sub: payload.sub,
      accountId: payload.sub,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      membershipId: payload.membershipId,
      roles: payload.roles,
    };
  }
}
