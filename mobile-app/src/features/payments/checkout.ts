import type { CustomerPaymentOrder } from "@gymride/types";
export interface CheckoutProof {
  orderId: string;
  paymentId: string;
  signature: string;
}
export interface NativeCheckout {
  open(options: {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
  }): Promise<{
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }>;
}
export async function openCheckout(
  order: CustomerPaymentOrder,
  native: NativeCheckout,
): Promise<CheckoutProof | null> {
  if (order.provider === "development") return null;
  if (order.provider !== "razorpay" || !order.keyId)
    throw new Error("Checkout configuration unavailable");
  const result = await native.open({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: "GYMRide",
  });
  return {
    orderId: result.razorpay_order_id,
    paymentId: result.razorpay_payment_id,
    signature: result.razorpay_signature,
  };
}
