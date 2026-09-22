import { GymStatus } from '@prisma/client';
import { canTransition, ownerCanEdit } from './gym-state';

describe('gym state policy', () => {
  it.each([
    [GymStatus.DRAFT, GymStatus.PENDING_APPROVAL],
    [GymStatus.REJECTED, GymStatus.PENDING_APPROVAL],
    [GymStatus.PENDING_APPROVAL, GymStatus.APPROVED],
    [GymStatus.PENDING_APPROVAL, GymStatus.REJECTED],
    [GymStatus.APPROVED, GymStatus.SUSPENDED],
    [GymStatus.SUSPENDED, GymStatus.APPROVED],
  ])('allows %s -> %s', (from, to) => expect(canTransition(from, to)).toBe(true));

  it('prevents self-approval and invalid transitions', () => {
    expect(canTransition(GymStatus.DRAFT, GymStatus.APPROVED)).toBe(false);
    expect(ownerCanEdit(GymStatus.APPROVED)).toBe(false);
    expect(ownerCanEdit(GymStatus.REJECTED)).toBe(true);
  });
});
