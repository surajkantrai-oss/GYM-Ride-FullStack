import { HttpStatus, Injectable } from '@nestjs/common';
import { BranchStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

export const branchSelect = {
  id: true,
  gymId: true,
  name: true,
  address: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  latitude: true,
  longitude: true,
  phone: true,
  email: true,
  timezone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  amenities: { select: { amenity: { select: { id: true, slug: true, name: true } } } },
  operatingHours: {
    select: {
      id: true,
      weekday: true,
      period: true,
      opensAt: true,
      closesAt: true,
      isClosed: true,
    },
    orderBy: [{ weekday: 'asc' as const }, { period: 'asc' as const }],
  },
} satisfies Prisma.GymBranchSelect;

@Injectable()
export class BranchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: GymAccessService,
  ) {}
  async create(user: AuthUser, gymId: string, dto: CreateBranchDto): Promise<unknown> {
    await this.access.assertGymOwnerOrAdmin(user, gymId);
    return this.prisma.gymBranch.create({ data: this.data(dto, gymId), select: branchSelect });
  }
  async list(user: AuthUser, gymId: string): Promise<unknown[]> {
    await this.access.assertGymManagement(user, gymId);
    return this.prisma.gymBranch.findMany({
      where: { gymId },
      select: branchSelect,
      orderBy: { createdAt: 'asc' },
    });
  }
  async get(user: AuthUser, branchId: string): Promise<unknown> {
    await this.access.assertBranchManagement(user, branchId);
    return this.prisma.gymBranch.findUnique({ where: { id: branchId }, select: branchSelect });
  }
  async update(user: AuthUser, branchId: string, dto: UpdateBranchDto): Promise<unknown> {
    await this.access.assertBranchManagement(user, branchId);
    if (dto.status === BranchStatus.SUSPENDED && !this.access.isAdmin(user))
      throw new DomainException(
        ApiErrorCode.BRANCH_ACCESS_DENIED,
        'Only an administrator can suspend a branch',
        HttpStatus.FORBIDDEN,
      );
    const { status, ...fields } = dto;
    return this.prisma.gymBranch.update({
      where: { id: branchId },
      data: { ...fields, email: fields.email?.trim().toLowerCase(), status },
      select: branchSelect,
    });
  }
  private data(dto: CreateBranchDto, gymId: string): Prisma.GymBranchCreateInput {
    return {
      gym: { connect: { id: gymId } },
      name: dto.name.trim(),
      address: dto.address.trim(),
      city: dto.city.trim(),
      state: dto.state.trim(),
      postalCode: dto.postalCode.trim(),
      country: dto.country.toUpperCase(),
      latitude: dto.latitude,
      longitude: dto.longitude,
      phone: dto.phone,
      email: dto.email?.trim().toLowerCase(),
      timezone: dto.timezone,
    };
  }
}
