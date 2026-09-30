/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditAction, GymOsFeature, GymOsMemberChargeStatus, GymOsMemberPaymentStatus, Prisma, RoleName } from '@prisma/client';
import { DateTime } from 'luxon';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';
import { AuthUser } from '../common/types/auth-user';
import { PrismaService } from '../database/prisma.service';
import { GymAccessService } from '../gym-access/gym-access.service';
import { MemberFinanceListDto, RecordMemberPaymentDto } from './gym-os-member-finance.dto';
import { GymOsEntitlementService } from './gym-os-entitlement.service';

@Injectable()
export class GymOsMemberFinanceService {
  constructor(private readonly prisma: PrismaService, private readonly access: GymAccessService, private readonly entitlements: GymOsEntitlementService) {}

  async record(user: AuthUser, gymId: string, key: string, dto: RecordMemberPaymentDto) {
    await this.access.assertGymOsMemberRead(user, gymId);
    await this.feature(gymId);
    if (!key?.trim()) this.fail(ApiErrorCode.GYMOS_PAYMENT_IDEMPOTENCY_CONFLICT, 'Idempotency-Key required', HttpStatus.BAD_REQUEST);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.chargeId}))`;
      const existing = await tx.gymOsMemberPayment.findUnique({ where: { gymId_idempotencyKey: { gymId, idempotencyKey: key } }, include: { receipt: true, allocations: true } });
      if (existing) {
        const allocation = existing.allocations[0];
        if (existing.amountMinor !== dto.amountMinor || allocation?.chargeId !== dto.chargeId || existing.method !== dto.method)
          this.fail(ApiErrorCode.GYMOS_PAYMENT_IDEMPOTENCY_CONFLICT, 'Idempotency key payload conflict', HttpStatus.CONFLICT);
        return this.paymentResponse(existing);
      }
      const charge = await tx.gymOsMemberCharge.findFirst({ where: { id: dto.chargeId, gymId }, include: { allocations: { where: { payment: { status: GymOsMemberPaymentStatus.RECORDED } } } } });
      if (!charge) this.fail(ApiErrorCode.GYMOS_CHARGE_NOT_FOUND, 'Charge not found', HttpStatus.NOT_FOUND);
      if (charge.status === GymOsMemberChargeStatus.VOID) this.fail(ApiErrorCode.GYMOS_CHARGE_VOID, 'Charge is void', HttpStatus.CONFLICT);
      const paid = charge.allocations.reduce((sum, value) => sum + value.amountMinor, 0);
      const outstanding = charge.amountMinor - paid;
      if (dto.amountMinor > outstanding) this.fail(ApiErrorCode.GYMOS_PAYMENT_EXCEEDS_OUTSTANDING, 'Payment exceeds outstanding balance', HttpStatus.CONFLICT);
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
      if (Number.isNaN(paidAt.getTime()) || paidAt > new Date(Date.now() + 300000)) this.fail(ApiErrorCode.GYMOS_PAYMENT_AMOUNT_INVALID, 'Invalid payment date', HttpStatus.BAD_REQUEST);
      const payment = await tx.gymOsMemberPayment.create({ data: { gymId, memberId: charge.memberId, amountMinor: dto.amountMinor, currency: charge.currency, method: dto.method, paidAt, reference: dto.reference?.trim(), notes: dto.notes?.trim(), recordedByUserId: user.id, idempotencyKey: key }, include: { allocations: true } });
      await tx.gymOsPaymentAllocation.create({ data: { paymentId: payment.id, chargeId: charge.id, amountMinor: dto.amountMinor } });
      const total = paid + dto.amountMinor;
      await tx.gymOsMemberCharge.update({ where: { id: charge.id }, data: { status: total === charge.amountMinor ? 'PAID' : 'PARTIALLY_PAID' } });
      const year = paidAt.getUTCFullYear();
      const counter = await tx.gymOsReceiptCounter.upsert({ where: { gymId_year: { gymId, year } }, create: { gymId, year, value: 1 }, update: { value: { increment: 1 } } });
      const receipt = await tx.gymOsMemberReceipt.create({ data: { gymId, paymentId: payment.id, receiptNumber: `GR-${year}-${String(counter.value).padStart(6, '0')}` } });
      await this.audit(tx, user.id, AuditAction.GYMOS_MEMBER_PAYMENT_RECORDED, payment.id, { gymId, memberId: charge.memberId, chargeId: charge.id, amountMinor: dto.amountMinor });
      return { ...payment, allocations: [{ chargeId: charge.id, amountMinor: dto.amountMinor }], receipt, remainingDueMinor: charge.amountMinor - total };
    });
  }

  async reverse(user: AuthUser, gymId: string, paymentId: string, reason: string) {
    if (user.roles.includes(RoleName.GYM_STAFF)) this.fail(ApiErrorCode.GYMOS_PAYMENT_FORBIDDEN, 'Staff cannot reverse payments', HttpStatus.FORBIDDEN);
    await this.access.assertGymOsMemberWrite(user, gymId);
    await this.feature(gymId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${paymentId}))`;
      const payment = await tx.gymOsMemberPayment.findFirst({ where: { id: paymentId, gymId }, include: { allocations: true, receipt: true } });
      if (!payment) this.fail(ApiErrorCode.GYMOS_PAYMENT_NOT_FOUND, 'Payment not found', HttpStatus.NOT_FOUND);
      if (payment.status === 'REVERSED') this.fail(ApiErrorCode.GYMOS_PAYMENT_ALREADY_REVERSED, 'Payment already reversed', HttpStatus.CONFLICT);
      const value = await tx.gymOsMemberPayment.update({ where: { id: payment.id }, data: { status: 'REVERSED', reversedAt: new Date(), reversedByUserId: user.id, reversalReason: reason } });
      for (const allocation of payment.allocations) await this.refreshCharge(tx, allocation.chargeId, payment.id);
      await this.audit(tx, user.id, AuditAction.GYMOS_MEMBER_PAYMENT_REVERSED, payment.id, { gymId, reason });
      return { ...value, receipt: payment.receipt };
    });
  }

  async charges(user: AuthUser, gymId: string, query: MemberFinanceListDto) { await this.access.assertGymOsMemberRead(user, gymId); await this.feature(gymId); return this.chargeList({ ...query, gymId }); }
  async payments(user: AuthUser, gymId: string, query: MemberFinanceListDto) { await this.access.assertGymOsMemberRead(user, gymId); await this.feature(gymId); return this.paymentList({ ...query, gymId }); }
  async member(user: AuthUser, gymId: string, memberId: string) { await this.access.assertGymOsMemberRead(user, gymId); await this.feature(gymId); const charges = await this.chargeList({ gymId, memberId, page: 1, pageSize: 100 }); const payments = await this.paymentList({ gymId, memberId, page: 1, pageSize: 100 }); return { charges: charges.data, payments: payments.data, totalFeeMinor: charges.data.reduce((s, x) => s + x.amountMinor, 0), totalPaidMinor: charges.data.reduce((s, x) => s + x.totalPaidMinor, 0), outstandingMinor: charges.data.reduce((s, x) => s + x.outstandingMinor, 0) }; }
  async receipt(user: AuthUser, gymId: string, id: string) { await this.access.assertGymOsMemberRead(user, gymId); await this.feature(gymId); const value = await this.prisma.gymOsMemberReceipt.findFirst({ where: { id, gymId }, include: { gym: { select: { name: true } }, payment: { include: { member: true, allocations: { include: { charge: { include: { membership: true } } } } } } } }); if (!value) this.fail(ApiErrorCode.GYMOS_RECEIPT_NOT_FOUND, 'Receipt not found', HttpStatus.NOT_FOUND); return value; }
  async summary(user: AuthUser, gymId: string) { await this.access.assertGymOsMemberRead(user, gymId); await this.feature(gymId); return this.summaryInternal(gymId); }
  adminCharges(q: MemberFinanceListDto) { return this.chargeList(q); }
  adminPayments(q: MemberFinanceListDto) { return this.paymentList(q); }
  adminSummary(gymId: string) { return this.summaryInternal(gymId); }
  async reconcile(gymId?: string) { const charges = await this.prisma.gymOsMemberCharge.findMany({ where: { gymId }, include: { allocations: { where: { payment: { status: 'RECORDED' } } } } }); return charges.flatMap((c) => { const paid = c.allocations.reduce((s, a) => s + a.amountMinor, 0), expected = c.status === 'VOID' ? 'VOID' : paid === c.amountMinor ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID'; return paid > c.amountMinor || c.status !== expected ? [{ chargeId: c.id, code: paid > c.amountMinor ? 'PAID_EXCEEDS_CHARGE' : 'STATUS_MISMATCH', expected, actual: c.status, paidMinor: paid }] : []; }); }

  private async chargeList(q: MemberFinanceListDto & { gymId?: string }) { const where: Prisma.GymOsMemberChargeWhereInput = { gymId: q.gymId, memberId: q.memberId, status: q.chargeStatus }; const today = await this.today(q.gymId); if (q.dueBucket === 'OVERDUE') where.AND = [{ dueDate: { lt: today } }, { status: { in: ['UNPAID','PARTIALLY_PAID'] } }]; if (q.dueBucket === 'DUE_TODAY') where.dueDate = today; if (q.search) where.member = { OR: [{ firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }, { memberCode: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] }; const [data,total] = await Promise.all([this.prisma.gymOsMemberCharge.findMany({ where, include: { member: true, membership: true, allocations: { where: { payment: { status: 'RECORDED' } } } }, orderBy: { dueDate: 'asc' }, skip: (q.page-1)*q.pageSize, take: q.pageSize }), this.prisma.gymOsMemberCharge.count({ where })]); return { data: data.map(c => this.chargeResponse(c,today)), meta: { page:q.page,limit:q.pageSize,total,totalPages:Math.ceil(total/q.pageSize) } }; }
  private async paymentList(q: MemberFinanceListDto & { gymId?: string }) { const where: Prisma.GymOsMemberPaymentWhereInput = { gymId:q.gymId,memberId:q.memberId,method:q.method,status:q.paymentStatus,paidAt: q.dateFrom||q.dateTo ? { gte:q.dateFrom?new Date(q.dateFrom):undefined,lte:q.dateTo?new Date(`${q.dateTo.slice(0,10)}T23:59:59.999Z`):undefined }:undefined }; if(q.search) where.member={ OR:[{firstName:{contains:q.search,mode:'insensitive'}},{lastName:{contains:q.search,mode:'insensitive'}},{memberCode:{contains:q.search,mode:'insensitive'}}]}; const [data,total]=await Promise.all([this.prisma.gymOsMemberPayment.findMany({where,include:{member:true,receipt:true,allocations:true},orderBy:{paidAt:'desc'},skip:(q.page-1)*q.pageSize,take:q.pageSize}),this.prisma.gymOsMemberPayment.count({where})]); return {data:data.map(v=>this.paymentResponse(v)),meta:{page:q.page,limit:q.pageSize,total,totalPages:Math.ceil(total/q.pageSize)}}; }
  private async summaryInternal(gymId:string){ const [start,end]=await this.month(gymId), today=await this.today(gymId); const [todayCollected,monthCollected,financial,paymentsCount,statuses]=await Promise.all([this.prisma.gymOsMemberPayment.aggregate({_sum:{amountMinor:true},where:{gymId,status:'RECORDED',paidAt:{gte:today,lt:new Date(today.getTime()+86400000)}}}),this.prisma.gymOsMemberPayment.aggregate({_sum:{amountMinor:true},where:{gymId,status:'RECORDED',paidAt:{gte:start,lt:end}}}),this.prisma.$queryRaw<Array<{outstanding:bigint;overdue:bigint}>>`SELECT COALESCE(SUM(GREATEST(c.amount_minor-COALESCE(a.paid,0),0)),0)::bigint AS outstanding, COALESCE(SUM(CASE WHEN c.due_date < ${today} AND c.amount_minor>COALESCE(a.paid,0) THEN c.amount_minor-COALESCE(a.paid,0) ELSE 0 END),0)::bigint AS overdue FROM gym_os_member_charges c LEFT JOIN (SELECT pa.charge_id,SUM(pa.amount_minor) paid FROM gym_os_payment_allocations pa JOIN gym_os_member_payments p ON p.id=pa.payment_id AND p.status='RECORDED' GROUP BY pa.charge_id) a ON a.charge_id=c.id WHERE c.gym_id=${gymId}::uuid AND c.status<>'VOID'`,this.prisma.gymOsMemberPayment.count({where:{gymId,status:'RECORDED'}}),this.prisma.gymOsMemberCharge.groupBy({by:['status'],where:{gymId},_count:true})]); const counts=Object.fromEntries(statuses.map(s=>[s.status,s._count])),money=financial[0]??{outstanding:0n,overdue:0n}; return {collectedTodayMinor:todayCollected._sum.amountMinor??0,collectedThisMonthMinor:monthCollected._sum.amountMinor??0,outstandingMinor:Number(money.outstanding),overdueMinor:Number(money.overdue),paymentsCount,paidMemberships:counts.PAID??0,partiallyPaid:counts.PARTIALLY_PAID??0,unpaid:counts.UNPAID??0}; }
  private chargeResponse(c:any,today:Date){const totalPaidMinor=c.allocations.reduce((s:number,a:any)=>s+a.amountMinor,0),outstandingMinor=Math.max(0,c.amountMinor-totalPaidMinor),daysOverdue=Math.max(0,Math.floor((today.getTime()-c.dueDate.getTime())/86400000)),isOverdue=outstandingMinor>0&&c.dueDate<today;return{...c,totalPaidMinor,outstandingMinor,isOverdue,daysOverdue:isOverdue?daysOverdue:0,effectiveStatus:isOverdue?'OVERDUE':c.status};}
  private paymentResponse(v:any){return v;}
  private async refreshCharge(tx:Prisma.TransactionClient,id:string,excluding:string){const c=await tx.gymOsMemberCharge.findUniqueOrThrow({where:{id},include:{allocations:{where:{payment:{status:'RECORDED',id:{not:excluding}}}}}});const paid=c.allocations.reduce((s,a)=>s+a.amountMinor,0);await tx.gymOsMemberCharge.update({where:{id},data:{status:paid===c.amountMinor?'PAID':paid>0?'PARTIALLY_PAID':'UNPAID'}});}
  private async feature(gymId:string){const e=await this.entitlements.getEffectiveEntitlements(gymId);if(!e.subscribed||!e.features.includes(GymOsFeature.DUES))this.fail(ApiErrorCode.GYMOS_PAYMENT_FEATURE_REQUIRED,'Active GymOS dues entitlement required',HttpStatus.PAYMENT_REQUIRED);}
  private async today(gymId?:string){const b=gymId?await this.prisma.gymBranch.findFirst({where:{gymId},select:{timezone:true}}):null;return DateTime.now().setZone(b?.timezone??'Asia/Kolkata').startOf('day').toUTC().toJSDate();}
  private async month(gymId:string){const b=await this.prisma.gymBranch.findFirst({where:{gymId},select:{timezone:true}}),d=DateTime.now().setZone(b?.timezone??'Asia/Kolkata').startOf('month');return[d.toUTC().toJSDate(),d.plus({months:1}).toUTC().toJSDate()]as const;}
  private audit(tx:Prisma.TransactionClient,actorUserId:string,action:AuditAction,entityId:string,metadata:Prisma.InputJsonValue){return tx.auditLog.create({data:{actorUserId,action,entityType:'GymOsMemberPayment',entityId,metadata}});}
  private fail(code:ApiErrorCode,message:string,status:HttpStatus):never{throw new DomainException(code,message,status);}
}
