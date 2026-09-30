import { createHash } from 'node:crypto';
import { GymOsReminderChannel } from '@prisma/client';
export interface GymOsMessagingProvider { readonly name:string; send(input:{deliveryId:string;channel:GymOsReminderChannel;contact:string;template:string}):Promise<{messageId:string}>; }
export class DevelopmentGymOsMessagingProvider implements GymOsMessagingProvider {readonly name='development';send(input:{deliveryId:string;channel:GymOsReminderChannel;contact:string;template:string}):Promise<{messageId:string}>{return Promise.resolve({messageId:`dev_${createHash('sha256').update(input.deliveryId).digest('hex').slice(0,24)}`});}}
