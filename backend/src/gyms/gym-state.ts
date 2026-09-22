import { GymStatus } from '@prisma/client';

export function ownerCanEdit(status: GymStatus): boolean {
  return status === GymStatus.DRAFT || status === GymStatus.REJECTED;
}
export function canTransition(from: GymStatus, to: GymStatus): boolean {
  return (
    (from === GymStatus.DRAFT && to === GymStatus.PENDING_APPROVAL) ||
    (from === GymStatus.REJECTED && to === GymStatus.PENDING_APPROVAL) ||
    (from === GymStatus.PENDING_APPROVAL &&
      (to === GymStatus.APPROVED || to === GymStatus.REJECTED)) ||
    (from === GymStatus.APPROVED && to === GymStatus.SUSPENDED) ||
    (from === GymStatus.SUSPENDED && to === GymStatus.APPROVED)
  );
}
