import { AppError } from '../../common/errors/app-error.js';
import { prisma } from '../../database/prisma.js';
import { assertPermission, type AuthenticatedActor } from '../auth/authorization.js';
import type { PolicyInput } from './policy.schema.js';

export async function listPolicies(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'policies', action: 'read' });
  return prisma.rentalPolicyVersion.findMany({ orderBy: { effectiveFrom: 'desc' } });
}
export async function getCurrentPolicy(actor: AuthenticatedActor) {
  assertPermission(actor, { module: 'policies', action: 'read' });
  const now = new Date();
  const policy = await prisma.rentalPolicyVersion.findFirst({
    where: {
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!policy) throw new AppError(404, 'POLICY_NOT_FOUND', 'No active rental policy');
  return policy;
}
export async function createPolicy(actor: AuthenticatedActor, input: PolicyInput) {
  assertPermission(actor, { module: 'policies', action: 'manage' });
  return prisma.$transaction(async (tx) => {
    const overlap = await tx.rentalPolicyVersion.findFirst({
      where: {
        effectiveFrom: { lt: input.effectiveTo ?? new Date('9999-12-31') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (overlap) {
      if (overlap.effectiveTo === null && overlap.effectiveFrom < input.effectiveFrom)
        await tx.rentalPolicyVersion.update({
          where: { id: overlap.id },
          data: { effectiveTo: input.effectiveFrom },
        });
      else
        throw new AppError(
          409,
          'POLICY_OVERLAP',
          'Policy effective range overlaps an existing version',
        );
    }
    return tx.rentalPolicyVersion.create({
      data: { ...input, lateFeeFormulaVersion: 2, createdBy: actor.id },
    });
  });
}
