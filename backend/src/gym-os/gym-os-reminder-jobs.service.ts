/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import { GymOsReminderCampaignService } from './gym-os-reminder-campaign.service';
import { GymOsReminderService } from './gym-os-reminder.service';
@Injectable()
export class GymOsReminderJobsService implements OnModuleInit,OnApplicationShutdown {
 private readonly logger=new Logger(GymOsReminderJobsService.name);private readonly enabled:boolean;private readonly connection:{host:string;port:number;password?:string};private queue?:Queue;private worker?:Worker;
 constructor(config:ConfigService,private readonly reminders:GymOsReminderService,private readonly campaigns:GymOsReminderCampaignService){this.enabled=config.get<boolean>('GYMOS_REMINDER_QUEUE_ENABLED',false);this.connection={host:config.getOrThrow<string>('REDIS_HOST'),port:config.getOrThrow<number>('REDIS_PORT'),password:config.get<string>('REDIS_PASSWORD')||undefined};}
 async onModuleInit(){if(!this.enabled)return;this.queue=new Queue('gymos-reminders',{connection:this.connection,defaultJobOptions:{attempts:5,backoff:{type:'exponential',delay:1000},removeOnComplete:1000,removeOnFail:5000}});this.worker=new Worker('gymos-reminders',(job:Job)=>this.handle(job.name),{connection:this.connection,concurrency:2});this.worker.on('failed',(job,error)=>this.logger.error({jobId:job?.id,name:job?.name,error:error.message},'GymOS reminder job failed'));await this.reminders.recoverStaleProcessing();await Promise.all([this.queue.add('evaluate',{}, {jobId:'gymos-reminder-evaluate',repeat:{every:60*60*1000}}),this.queue.add('dispatch',{}, {jobId:'gymos-reminder-dispatch',repeat:{every:60*1000}}),this.queue.add('campaign',{}, {jobId:'gymos-reminder-campaign',repeat:{every:60*1000}}),this.queue.add('reconcile',{}, {jobId:'gymos-reminder-reconcile',repeat:{every:5*60*1000}})]);}
 private async handle(name:string){if(name==='evaluate')return this.reminders.evaluate();if(name==='campaign')return this.campaigns.processDue();if(name==='reconcile')return this.reminders.recoverStaleProcessing();return this.reminders.processDue();}
 async onApplicationShutdown(){await this.worker?.close();await this.queue?.close();}
}
