export abstract class PayoutProvider {
  abstract process(
    reference: string,
    amount: number,
    currency: string,
  ): Promise<{ reference: string; simulated: boolean }>;
}

export class DevelopmentPayoutProvider extends PayoutProvider {
  process(
    reference: string,
    amount: number,
    currency: string,
  ): Promise<{ reference: string; simulated: boolean }> {
    if (!Number.isSafeInteger(amount) || amount <= 0 || currency !== 'INR')
      throw new Error('Invalid simulated payout');
    return Promise.resolve({ reference: `simulated_${reference}`, simulated: true });
  }
}
