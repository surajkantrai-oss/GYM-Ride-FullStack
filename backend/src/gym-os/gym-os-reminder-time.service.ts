import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../database/prisma.service';
@Injectable()
export class GymOsReminderTimeService {
 constructor(private readonly prisma:PrismaService){}
 async timezone(gymId:string):Promise<string>{return(await this.prisma.gymBranch.findFirst({where:{gymId},select:{timezone:true}}))?.timezone??'Asia/Kolkata';}
 async resolveAllowedSendTime(gymId:string,desired:Date,quietStart='21:00',quietEnd='08:00'):Promise<Date>{const zone=await this.timezone(gymId),local=DateTime.fromJSDate(desired).setZone(zone),[sh=21,sm=0]=quietStart.split(':').map(Number),[eh=8,em=0]=quietEnd.split(':').map(Number),minute=local.hour*60+local.minute,start=sh*60+sm,end=eh*60+em,inQuiet=start>end?minute>=start||minute<end:minute>=start&&minute<end;if(!inQuiet)return desired;let allowed=local.set({hour:eh,minute:em,second:0,millisecond:0});if(start>end&&minute>=start)allowed=allowed.plus({days:1});return allowed.toUTC().toJSDate();}
 async atLocalSendTime(gymId:string,time:string,quietStart:string,quietEnd:string):Promise<Date>{const zone=await this.timezone(gymId),[h=10,m=0]=time.split(':').map(Number);let desired=DateTime.now().setZone(zone).set({hour:h,minute:m,second:0,millisecond:0});if(desired<DateTime.now().setZone(zone))desired=desired.plus({days:1});return this.resolveAllowedSendTime(gymId,desired.toUTC().toJSDate(),quietStart,quietEnd);}
}
