import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type JwtPayload = {
  sub: string;
  accountId: string;
  tenantId?: string;
  membershipId?: string;
  roleCodes?: string[];
  tenantSlug?: string;
  sessionId?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dev-change-me'),
    });
  }

  validate(payload: JwtPayload) {
    return {
      accountId: payload.accountId ?? payload.sub,
      tenantId: payload.tenantId,
      membershipId: payload.membershipId,
      roleCodes: payload.roleCodes ?? [],
      tenantSlug: payload.tenantSlug,
      sessionId: payload.sessionId,
    };
  }
}
