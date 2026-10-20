import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { type OwnedRequest, type Owner, OwnerService } from './owner.service';

/** Requires a caller identity and puts it on the request for `@CurrentOwner()`. */
@Injectable()
export class OwnerGuard implements CanActivate {
  constructor(@Inject(OwnerService) private readonly owners: OwnerService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<OwnedRequest>();
    const owner = this.owners.resolve(req);
    if (!owner) throw new UnauthorizedException();
    req.owner = owner;
    return true;
  }
}

/** The caller resolved by `OwnerGuard`. Only valid on routes that use the guard. */
export const CurrentOwner = createParamDecorator((_data: unknown, context: ExecutionContext): Owner => {
  const owner = context.switchToHttp().getRequest<OwnedRequest>().owner;
  if (!owner) throw new UnauthorizedException();
  return owner;
});
