import { HttpStatus, Injectable } from '@nestjs/common';
import { GymMembershipRole, MembershipStatus, RoleName } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class GymAccessService {
  constructor(private readonly prisma: PrismaService) {}
  isAdmin(user: AuthUser): boolean {
    return user.roles.includes(RoleName.ADMIN) || user.roles.includes(RoleName.SUPER_ADMIN);
  }

  async assertGymOwnerOrAdmin(
    user: AuthUser,
    gymId: string,
  ): Promise<{ id: string; ownerId: string; status: string }> {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!gym || (!this.isAdmin(user) && gym.ownerId !== user.id)) this.gymNotFound();
    return gym;
  }

  async assertGymManagement(user: AuthUser, gymId: string): Promise<void> {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { ownerId: true },
    });
    if (!gym) this.gymNotFound();
    if (this.isAdmin(user) || gym.ownerId === user.id) return;
    const membership = await this.prisma.gymMembership.findFirst({
      where: {
        userId: user.id,
        gymId,
        branchId: null,
        role: GymMembershipRole.MANAGER,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!membership) this.gymNotFound();
  }

  async assertGymOsMemberRead(user: AuthUser, gymId: string): Promise<void> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { ownerId: true } });
    if (!gym) this.gymNotFound();
    if (this.isAdmin(user) || gym.ownerId === user.id) return;
    const membership = await this.prisma.gymMembership.findFirst({
      where: { userId: user.id, gymId, status: MembershipStatus.ACTIVE, role: { in: [GymMembershipRole.MANAGER, GymMembershipRole.STAFF] } },
      select: { id: true },
    });
    if (!membership) this.gymNotFound();
  }

  async assertGymOsMemberWrite(user: AuthUser, gymId: string): Promise<void> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { ownerId: true } });
    if (!gym) this.gymNotFound();
    if (gym.ownerId === user.id) return;
    const membership = await this.prisma.gymMembership.findFirst({
      where: { userId: user.id, gymId, status: MembershipStatus.ACTIVE, role: GymMembershipRole.MANAGER },
      select: { id: true },
    });
    if (!membership) this.gymNotFound();
  }

  async assertBranchManagement(
    user: AuthUser,
    branchId: string,
  ): Promise<{ id: string; gymId: string }> {
    const branch = await this.prisma.gymBranch.findUnique({
      where: { id: branchId },
      select: { id: true, gymId: true, gym: { select: { ownerId: true } } },
    });
    if (!branch) this.branchNotFound();
    if (this.isAdmin(user) || branch.gym.ownerId === user.id)
      return { id: branch.id, gymId: branch.gymId };
    const membership = await this.prisma.gymMembership.findFirst({
      where: {
        userId: user.id,
        gymId: branch.gymId,
        status: MembershipStatus.ACTIVE,
        role: GymMembershipRole.MANAGER,
        OR: [{ branchId: null }, { branchId }],
      },
    });
    if (!membership) this.branchNotFound();
    return { id: branch.id, gymId: branch.gymId };
  }

  async assertBranchCheckIn(
    user: AuthUser,
    branchId: string,
  ): Promise<{ id: string; gymId: string }> {
    const branch = await this.prisma.gymBranch.findUnique({
      where: { id: branchId },
      select: { id: true, gymId: true, gym: { select: { ownerId: true } } },
    });
    if (!branch) this.checkInForbidden();
    if (this.isAdmin(user) || branch.gym.ownerId === user.id)
      return { id: branch.id, gymId: branch.gymId };
    const membership = await this.prisma.gymMembership.findFirst({
      where: {
        userId: user.id,
        gymId: branch.gymId,
        status: MembershipStatus.ACTIVE,
        role: { in: [GymMembershipRole.MANAGER, GymMembershipRole.STAFF] },
        OR: [{ branchId: null }, { branchId }],
      },
      select: { id: true },
    });
    if (!membership) this.checkInForbidden();
    return { id: branch.id, gymId: branch.gymId };
  }

  private gymNotFound(): never {
    throw new DomainException(ApiErrorCode.GYM_NOT_FOUND, 'Gym not found', HttpStatus.NOT_FOUND);
  }
  private branchNotFound(): never {
    throw new DomainException(
      ApiErrorCode.BRANCH_NOT_FOUND,
      'Branch not found',
      HttpStatus.NOT_FOUND,
    );
  }
  private checkInForbidden(): never {
    throw new DomainException(
      ApiErrorCode.BRANCH_CHECK_IN_FORBIDDEN,
      'You are not authorized to verify check-ins for this branch',
      HttpStatus.FORBIDDEN,
    );
  }
}
