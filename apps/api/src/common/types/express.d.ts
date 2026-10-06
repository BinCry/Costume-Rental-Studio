import type { AuthenticatedActor } from '../../modules/auth/authorization.js';

declare module 'express-serve-static-core' {
  interface Locals {
    actor: AuthenticatedActor;
  }
}
