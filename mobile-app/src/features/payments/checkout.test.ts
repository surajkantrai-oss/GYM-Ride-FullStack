import { expect, it, vi } from "vitest";
import { openCheckout } from "./checkout";
import type { CustomerPaymentOrder } from "@gymride/types";
const order: CustomerPaymentOrder = {
  id: "payment",
  bookingId: "booking",
  orderId: "order",
  amount: 49900,
  currency: "INR",
  provider: "razorpay",
  keyId: "rzp_test_public",
  status: "PENDING",
  simulated: false,
};
it("passes only server order and public checkout values to native SDK", async () => {
  const open = vi.fn().mockResolvedValue({
    razorpay_order_id: "order",
    razorpay_payment_id: "provider-payment",
    razorpay_signature: "proof",
  });
  expect(await openCheckout(order, { open })).toEqual({
    orderId: "order",
    paymentId: "provider-payment",
    signature: "proof",
  });
  expect(open).toHaveBeenCalledWith({
    key: "rzp_test_public",
    order_id: "order",
    amount: 49900,
    currency: "INR",
    name: "GYMRide",
  });
});
it("development checkout never fabricates customer payment proof", async () => {
  const open = vi.fn();
  expect(
    await openCheckout({ ...order, provider: "development" }, { open }),
  ).toBeNull();
  expect(open).not.toHaveBeenCalled();
});
it("checkout cancellation never returns a success proof", async () => {
  await expect(
    openCheckout(order, { open: vi.fn().mockRejectedValue({ code: 2 }) }),
  ).rejects.toEqual({ code: 2 });
});
it("rejects missing provider configuration", async () => {
  await expect(
    openCheckout({ ...order, keyId: undefined }, { open: vi.fn() }),
  ).rejects.toThrow();
});
