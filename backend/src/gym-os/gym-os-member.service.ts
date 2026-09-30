/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, GymMemberStatus, GymOsFeature, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { normalizePhone } from '../common/utils/phone';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { AdminGymOsMemberListDto, CreateGymOsMemberDto, GymOsMemberImportDto, GymOsMemberListDto, UpdateGymOsMemberDto } from './gym-os-member.dto';
import { GymOsEntitlementService } from './gym-os-entitlement.service';

type ImportRow = { rowNumber: number; firstName: string; lastName?: string; phone: string; email?: string; primaryBranchId?: string; joinedAt?: string };
type ImportError = { rowNumber: number; field: string; code: string; message: string };

@Injectable()
export class GymOsMemberService {
  constructor(private readonly prisma: PrismaService, private readonly access: GymAccessService, private readonly entitlements: GymOsEntitlementService) {}

  async summary(user: AuthUser, gymId: string) {
    await this.authorize(user, gymId, false);
    const [entitlement, grouped] = await Promise.all([
      this.requireEntitlement(gymId),
      this.prisma.gymMember.groupBy({ by: ['status'], where: { gymId }, _count: true }),
    ]);
    const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count]));
    const active = counts.ACTIVE ?? 0;
    const limit = entitlement.limits!.members;
    return { total: grouped.reduce((sum, row) => sum + row._count, 0), active, inactive: counts.INACTIVE ?? 0, archived: counts.ARCHIVED ?? 0, memberLimit: limit, remainingCapacity: Math.max(0, limit - active), overLimit: active > limit };
  }

  async list(user: AuthUser, gymId: string, query: GymOsMemberListDto) {
    await this.authorize(user, gymId, false); await this.requireEntitlement(gymId);
    const where: Prisma.GymMemberWhereInput = { gymId, status: query.status ?? { not: GymMemberStatus.ARCHIVED }, primaryBranchId: query.branchId, createdAt: query.createdFrom ? { gte: new Date(query.createdFrom) } : undefined };
    if (query.search) where.OR = ['memberCode', 'firstName', 'lastName', 'phone', 'email'].map((field) => ({ [field]: { contains: query.search!.trim(), mode: 'insensitive' } }));
    const orderBy = query.sort === 'name' ? [{ firstName: 'asc' as const }, { lastName: 'asc' as const }] : query.sort === 'oldest' ? [{ createdAt: 'asc' as const }] : [{ createdAt: 'desc' as const }];
    const [data, total] = await Promise.all([this.prisma.gymMember.findMany({ where, select: this.listSelect(), orderBy, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.prisma.gymMember.count({ where })]);
    return { data, meta: { page: query.page, limit: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
  }

  async detail(user: AuthUser, gymId: string, id: string) {
    await this.authorize(user, gymId, false); await this.requireEntitlement(gymId);
    return this.findMember(gymId, id, true);
  }

  async create(user: AuthUser, gymId: string, dto: CreateGymOsMemberDto) {
    await this.authorize(user, gymId, true); await this.requireEntitlement(gymId);
    const normalized = this.normalize(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockGym(tx, gymId); await this.assertBranch(tx, gymId, normalized.primaryBranchId); await this.assertCapacity(tx, gymId, 1);
        const memberCode = await this.nextCode(tx);
        const member = await tx.gymMember.create({ data: { ...normalized, firstName: normalized.firstName!, phone: normalized.phone!, memberCode, gymId, status: GymMemberStatus.ACTIVE, createdByUserId: user.id }, select: this.detailSelect() });
        await tx.auditLog.create({ data: { actorUserId: user.id, action: AuditAction.GYMOS_MEMBER_CREATED, entityType: 'GymMember', entityId: member.id, metadata: { gymId, memberCode } } });
        return member;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) { this.rethrow(error); }
  }

  async update(user: AuthUser, gymId: string, id: string, dto: UpdateGymOsMemberDto) {
    await this.authorize(user, gymId, true); await this.requireEntitlement(gymId);
    const existing = await this.findMember(gymId, id, false);
    if (existing.status === GymMemberStatus.ARCHIVED) this.fail(ApiErrorCode.GYMOS_MEMBER_ARCHIVED, 'Archived members cannot be edited', HttpStatus.CONFLICT);
    const data = this.normalize(dto);
    await this.assertBranch(this.prisma, gymId, data.primaryBranchId);
    try {
      const value = await this.prisma.gymMember.update({ where: { id }, data: { ...data, updatedByUserId: user.id }, select: this.detailSelect() });
      await this.prisma.auditLog.create({ data: { actorUserId: user.id, action: AuditAction.GYMOS_MEMBER_UPDATED, entityType: 'GymMember', entityId: id, metadata: { gymId, changedFields: Object.keys(dto) } } });
      return value;
    } catch (error) { this.rethrow(error); }
  }

  async transition(user: AuthUser, gymId: string, id: string, target: GymMemberStatus) {
    await this.authorize(user, gymId, true); await this.requireEntitlement(gymId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockGym(tx, gymId);
      const member = await tx.gymMember.findFirst({ where: { id, gymId } });
      if (!member) this.notFound();
      if (member.status === GymMemberStatus.ARCHIVED) this.fail(ApiErrorCode.GYMOS_MEMBER_ARCHIVED, 'Archived members cannot change status', HttpStatus.CONFLICT);
      if (target === GymMemberStatus.ACTIVE && member.status !== GymMemberStatus.INACTIVE) this.invalidTransition();
      if (target === GymMemberStatus.INACTIVE && member.status !== GymMemberStatus.ACTIVE) this.invalidTransition();
      if (target === GymMemberStatus.ACTIVE) await this.assertCapacity(tx, gymId, 1);
      const action = target === GymMemberStatus.ACTIVE ? AuditAction.GYMOS_MEMBER_REACTIVATED : target === GymMemberStatus.INACTIVE ? AuditAction.GYMOS_MEMBER_DEACTIVATED : AuditAction.GYMOS_MEMBER_ARCHIVED;
      const value = await tx.gymMember.update({ where: { id }, data: { status: target, archivedAt: target === GymMemberStatus.ARCHIVED ? new Date() : null, updatedByUserId: user.id }, select: this.detailSelect() });
      await tx.auditLog.create({ data: { actorUserId: user.id, action, entityType: 'GymMember', entityId: id, metadata: { gymId } } });
      return value;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async previewImport(user: AuthUser, gymId: string, dto: GymOsMemberImportDto) {
    await this.authorize(user, gymId, true); const entitlement = await this.requireEntitlement(gymId);
    const { rows, errors } = await this.validateCsv(gymId, dto.csv);
    const active = await this.prisma.gymMember.count({ where: { gymId, status: GymMemberStatus.ACTIVE } });
    if (active + rows.length > entitlement.limits!.members) errors.push({ rowNumber: 0, field: 'plan', code: ApiErrorCode.GYMOS_MEMBER_IMPORT_LIMIT_EXCEEDED, message: 'Import exceeds the active-member plan limit' });
    return this.importReport(rows.length + errors.filter((e) => e.rowNumber > 0).length, rows, errors, 0);
  }

  async importMembers(user: AuthUser, gymId: string, dto: GymOsMemberImportDto) {
    await this.authorize(user, gymId, true); await this.requireEntitlement(gymId);
    const { rows, errors, totalRows } = await this.validateCsv(gymId, dto.csv);
    if (errors.length) return this.importReport(totalRows, rows, errors, 0);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockGym(tx, gymId); await this.assertCapacity(tx, gymId, rows.length);
        for (const row of rows) await tx.gymMember.create({ data: { gymId, memberCode: await this.nextCode(tx), firstName: row.firstName, lastName: row.lastName, phone: row.phone, email: row.email, primaryBranchId: row.primaryBranchId, joinedAt: row.joinedAt ? new Date(row.joinedAt) : null, createdByUserId: user.id } });
        await tx.auditLog.create({ data: { actorUserId: user.id, action: AuditAction.GYMOS_MEMBER_BULK_IMPORTED, entityType: 'Gym', entityId: gymId, metadata: { importedRows: rows.length } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.importReport(totalRows, rows, [], rows.length);
    } catch (error) { this.rethrow(error); }
  }

  adminList(query: AdminGymOsMemberListDto) {
    const where: Prisma.GymMemberWhereInput = { gymId: query.gymId, status: query.status, primaryBranchId: query.branchId };
    if (query.search) where.OR = ['memberCode', 'firstName', 'lastName', 'phone', 'email'].map((field) => ({ [field]: { contains: query.search!.trim(), mode: 'insensitive' } }));
    return Promise.all([this.prisma.gymMember.findMany({ where, select: { ...this.listSelect(), gym: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.prisma.gymMember.count({ where })]).then(([data, total]) => ({ data, meta: { page: query.page, limit: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } }));
  }
  async adminDetail(id: string) { const value = await this.prisma.gymMember.findUnique({ where: { id }, select: { ...this.listSelect(), gym: { select: { id: true, name: true } }, createdAt: true, updatedAt: true } }); if (!value) this.notFound(); return value; }

  private async authorize(user: AuthUser, gymId: string, write: boolean) { return write ? this.access.assertGymOsMemberWrite(user, gymId) : this.access.assertGymOsMemberRead(user, gymId); }
  private async requireEntitlement(gymId: string) { const value = await this.entitlements.getEffectiveEntitlements(gymId); if (!value.subscribed || !value.features.includes(GymOsFeature.MEMBERS)) this.fail(ApiErrorCode.GYMOS_MEMBERS_FEATURE_REQUIRED, 'An active GymOS plan with Members is required', HttpStatus.PAYMENT_REQUIRED); return value; }
  private async assertCapacity(tx: Prisma.TransactionClient, gymId: string, add: number) { const entitlement = await this.requireEntitlement(gymId); const count = await tx.gymMember.count({ where: { gymId, status: GymMemberStatus.ACTIVE } }); if (count + add > entitlement.limits!.members) this.fail(ApiErrorCode.GYMOS_MEMBER_LIMIT_REACHED, 'GymOS active-member limit reached', HttpStatus.CONFLICT); }
  private async lockGym(tx: Prisma.TransactionClient, gymId: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${gymId}))`; }
  private async assertBranch(db: Prisma.TransactionClient | PrismaService, gymId: string, branchId?: string | null) { if (!branchId) return; if (!await db.gymBranch.findFirst({ where: { id: branchId, gymId }, select: { id: true } })) this.fail(ApiErrorCode.GYMOS_MEMBER_BRANCH_INVALID, 'Primary branch does not belong to this gym', HttpStatus.BAD_REQUEST); }
  private async nextCode(tx: Prisma.TransactionClient) { const [row] = await tx.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('gym_os_member_code_seq') AS value`; if (!row) throw new Error('Member code sequence returned no value'); return `GM-${row.value.toString().padStart(6, '0')}`; }
  private normalize(dto: Partial<CreateGymOsMemberDto>) { const clean = (v?: string) => v?.trim() || undefined; let phone: string | undefined; let emergencyContactPhone: string | undefined; try { phone = dto.phone ? normalizePhone(dto.phone) : undefined; emergencyContactPhone = dto.emergencyContactPhone ? normalizePhone(dto.emergencyContactPhone) : undefined; } catch { this.fail(ApiErrorCode.GYMOS_MEMBER_PHONE_INVALID, 'Phone must use E.164 format', HttpStatus.BAD_REQUEST); } return { ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }), ...(dto.lastName !== undefined && { lastName: clean(dto.lastName) }), ...(phone && { phone }), ...(dto.email !== undefined && { email: clean(dto.email)?.toLowerCase() }), ...(dto.primaryBranchId !== undefined && { primaryBranchId: dto.primaryBranchId || null }), ...(dto.joinedAt !== undefined && { joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : null }), ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }), ...(dto.notes !== undefined && { notes: clean(dto.notes) }), ...(dto.emergencyContactName !== undefined && { emergencyContactName: clean(dto.emergencyContactName) }), ...(dto.emergencyContactPhone !== undefined && { emergencyContactPhone }), ...(dto.addressLine1 !== undefined && { addressLine1: clean(dto.addressLine1) }), ...(dto.city !== undefined && { city: clean(dto.city) }), ...(dto.state !== undefined && { state: clean(dto.state) }), ...(dto.postalCode !== undefined && { postalCode: clean(dto.postalCode) }), ...(dto.country !== undefined && { country: clean(dto.country)?.toUpperCase() }) }; }
  private async findMember(gymId: string, id: string, details: boolean) { const value = await this.prisma.gymMember.findFirst({ where: { id, gymId }, select: details ? this.detailSelect() : { id: true, status: true } }); if (!value) this.notFound(); return value; }
  private listSelect() { return { id: true, memberCode: true, firstName: true, lastName: true, phone: true, email: true, status: true, joinedAt: true, createdAt: true, primaryBranch: { select: { id: true, name: true } } } satisfies Prisma.GymMemberSelect; }
  private detailSelect() { return { ...this.listSelect(), dateOfBirth: true, notes: true, emergencyContactName: true, emergencyContactPhone: true, addressLine1: true, city: true, state: true, postalCode: true, country: true, updatedAt: true } satisfies Prisma.GymMemberSelect; }
  private async validateCsv(gymId: string, csv: string) { if (Buffer.byteLength(csv, 'utf8') > 1_048_576) this.fail(ApiErrorCode.GYMOS_MEMBER_IMPORT_TOO_LARGE, 'CSV exceeds 1 MB', HttpStatus.PAYLOAD_TOO_LARGE); const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim()); if (lines.length < 2) this.fail(ApiErrorCode.GYMOS_MEMBER_IMPORT_INVALID, 'CSV requires a header and at least one row', HttpStatus.BAD_REQUEST); if (lines.length - 1 > 1000) this.fail(ApiErrorCode.GYMOS_MEMBER_IMPORT_TOO_LARGE, 'CSV exceeds 1,000 rows', HttpStatus.PAYLOAD_TOO_LARGE); const headers = this.csvLine(lines[0]!); for (const required of ['firstName', 'phone']) if (!headers.includes(required)) this.fail(ApiErrorCode.GYMOS_MEMBER_IMPORT_INVALID, `Missing required header: ${required}`, HttpStatus.BAD_REQUEST); const errors: ImportError[] = []; const rows: ImportRow[] = []; const seen = new Set<string>(); for (let index = 1; index < lines.length; index++) { const values = this.csvLine(lines[index]!); const raw: Record<string, string | undefined> = Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim()])); const rowNumber = index + 1; const firstName = raw.firstName; const rawPhone = raw.phone; if (!firstName) { errors.push({ rowNumber, field: 'firstName', code: 'REQUIRED', message: 'First name is required' }); continue; } if (!rawPhone) { errors.push({ rowNumber, field: 'phone', code: 'REQUIRED', message: 'Phone is required' }); continue; } let phone: string; try { phone = normalizePhone(rawPhone); } catch { errors.push({ rowNumber, field: 'phone', code: ApiErrorCode.GYMOS_MEMBER_PHONE_INVALID, message: 'Invalid E.164 phone' }); continue; } if (seen.has(phone)) { errors.push({ rowNumber, field: 'phone', code: ApiErrorCode.GYMOS_MEMBER_ALREADY_EXISTS, message: 'Duplicate phone in CSV' }); continue; } seen.add(phone); const email = raw.email; const joinedAt = raw.joinedAt; const primaryBranchId = raw.primaryBranchId; if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push({ rowNumber, field: 'email', code: 'INVALID_EMAIL', message: 'Invalid email' }); continue; } if (joinedAt && Number.isNaN(Date.parse(joinedAt))) { errors.push({ rowNumber, field: 'joinedAt', code: 'INVALID_DATE', message: 'Invalid joined date' }); continue; } if (primaryBranchId && !await this.prisma.gymBranch.findFirst({ where: { id: primaryBranchId, gymId }, select: { id: true } })) { errors.push({ rowNumber, field: 'primaryBranchId', code: ApiErrorCode.GYMOS_MEMBER_BRANCH_INVALID, message: 'Branch does not belong to gym' }); continue; } rows.push({ rowNumber, firstName, lastName: raw.lastName || undefined, phone, email: email?.toLowerCase() || undefined, primaryBranchId: primaryBranchId || undefined, joinedAt: joinedAt || undefined }); } const existing = rows.length ? await this.prisma.gymMember.findMany({ where: { gymId, phone: { in: rows.map((row) => row.phone) } }, select: { phone: true } }) : []; const existingPhones = new Set(existing.map((row) => row.phone)); return { totalRows: lines.length - 1, rows: rows.filter((row) => { if (!existingPhones.has(row.phone)) return true; errors.push({ rowNumber: row.rowNumber, field: 'phone', code: ApiErrorCode.GYMOS_MEMBER_ALREADY_EXISTS, message: 'Member phone already exists in this gym' }); return false; }), errors }; }
  private csvLine(line: string) { const values: string[] = []; let value = ''; let quoted = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === ',' && !quoted) { values.push(value); value = ''; } else value += char; } values.push(value); return values; }
  private importReport(totalRows: number, rows: ImportRow[], errors: ImportError[], importedRows: number) { return { totalRows, validRows: rows.length, importedRows, skippedRows: totalRows - importedRows, failedRows: errors.filter((e) => e.rowNumber > 0).length, errors }; }
  private rethrow(error: unknown): never { if (error instanceof DomainException) throw error; if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') this.fail(ApiErrorCode.GYMOS_MEMBER_ALREADY_EXISTS, 'A member with this phone already exists in the gym', HttpStatus.CONFLICT); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') this.fail(ApiErrorCode.GYMOS_MEMBER_LIMIT_REACHED, 'Concurrent member update conflicted; retry safely', HttpStatus.CONFLICT); throw error; }
  private notFound(): never { this.fail(ApiErrorCode.GYMOS_MEMBER_NOT_FOUND, 'GymOS member not found', HttpStatus.NOT_FOUND); }
  private invalidTransition(): never { this.fail(ApiErrorCode.GYMOS_MEMBER_INVALID_STATUS_TRANSITION, 'Invalid member status transition', HttpStatus.CONFLICT); }
  private fail(code: ApiErrorCode, message: string, status: HttpStatus): never { throw new DomainException(code, message, status); }
}
