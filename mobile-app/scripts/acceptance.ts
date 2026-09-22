import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MobileApiClient } from "../src/api/client";
import { customerApi } from "../src/api/customer";

// Explicit local integration check. This exercises the actual mobile transport/contracts,
// not native storage or screen interaction, and intentionally retains auditable test bookings.
async function main() {
  const base = process.env.MOBILE_TEST_API_URL;
  if (!base || !["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Local API URL required");
  if (process.env.RUN_MOBILE_ACCEPTANCE !== "true")
    throw new Error("Explicit opt-in required");
  let refresh: string | null = null;
  const store = {
    read: async () => refresh,
    write: async (token: string) => {
      refresh = token;
    },
    clear: async () => {
      refresh = null;
    },
  };
  const client = new MobileApiClient(base, store, randomUUID, () => {});
  const api = customerApi(client);
  const phone = process.env.MOBILE_TEST_CUSTOMER_PHONE;
  const adminPhone = process.env.MOBILE_TEST_ADMIN_PHONE;
  assert(phone && adminPhone, "Development phones required");
  async function login(target: ReturnType<typeof customerApi>, number: string) {
    const challenge = await target.requestOtp(number);
    assert(challenge.developmentOtp, "Development OTP provider required");
    return target.verifyOtp(number, challenge.developmentOtp);
  }
  const auth = await login(api, phone);
  assert(auth.user.roles.includes("CUSTOMER"));
  await client.setTokens(auth.tokens);
  const adminStore = {
    read: async () => null,
    write: async () => {},
    clear: async () => {},
  };
  const admin = new MobileApiClient(base, adminStore, randomUUID, () => {});
  const adminAuth = await login(customerApi(admin), adminPhone);
  await admin.setTokens(adminAuth.tokens);
  let restored: MobileApiClient | undefined;
  try {
    assert.equal((await api.me()).phone, phone);
    const gyms = await api.gyms("search=GYMRide%20Mobile%20Development%20Gym");
    const gym = gyms.data.find(
      (item) => item.name === "GYMRide Mobile Development Gym",
    );
    assert(gym, "Run the explicit development fixture first");
    const detail = await api.gym(gym.id);
    const branch = detail.branches.find(
      (item) => item.name === "Development Central",
    );
    assert(branch);
    const nearby = await api.nearby(
      "latitude=12.9716&longitude=77.5946&radiusKm=10",
    );
    assert(nearby.data.some((item) => item.gymId === gym.id));
    const plan = (await api.plans(branch.id)).find(
      (item) => item.status === "ACTIVE" && item.type === "DAY_PASS",
    );
    assert(plan);
    const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const available = (await api.slots(branch.id, date, plan.id)).filter(
      (item) => item.available > 0 && item.status === "AVAILABLE",
    );
    assert(available.length >= 2);
    const input = {
      branchId: branch.id,
      planId: plan.id,
      slotId: available[0].id,
    };
    const key = randomUUID();
    const booking = await api.reserve(input, key);
    assert.equal(booking.status, "PAYMENT_PENDING");
    assert.equal(booking.priceMinor, plan.priceMinor);
    assert.equal((await api.reserve(input, key)).id, booking.id);
    const order = await api.order(booking.id);
    assert.equal(
      order.provider,
      "development",
      "Refusing non-development payment mode",
    );
    assert.equal(order.amount, booking.priceMinor);
    assert.equal((await api.order(booking.id)).id, order.id);
    await assert.rejects(
      api.verifyPayment(order.id, {
        orderId: order.orderId,
        paymentId: "untrusted-client-success",
        signature: "invalid",
      }),
    );
    assert.equal((await api.booking(booking.id)).status, "PAYMENT_PENDING");
    await admin.request(`/admin/finance/payments/${order.id}/simulate`, {
      method: "POST",
      body: "{}",
    });
    const confirmed = await api.booking(booking.id);
    assert.equal(confirmed.status, "CONFIRMED");
    assert.equal(confirmed.payment?.status, "SUCCESS");
    assert.equal(confirmed.branch.timezone, "Asia/Kolkata");
    assert.equal("providerPaymentId" in (confirmed.payment ?? {}), false);
    assert((await api.bookings(1)).data.some((item) => item.id === booking.id));
    const cancelled = await api.reserve(
      { ...input, slotId: available[1].id },
      randomUUID(),
    );
    assert.equal((await api.cancel(cancelled.id)).status, "CANCELLED");
    const profile = await api.updateProfile({ firstName: "Mobile acceptance" });
    assert.equal(profile.firstName, "Mobile acceptance");
    restored = new MobileApiClient(base, store, randomUUID, () => {});
    assert.equal(await restored.restore(), true);
    assert.equal((await customerApi(restored).me()).id, profile.id);
    console.log(
      JSON.stringify({
        mode: "development",
        bookingId: booking.id,
        paymentId: order.id,
        status: confirmed.status,
        checks: [
          "OTP",
          "profile",
          "discovery",
          "nearby",
          "branch",
          "plans",
          "slots",
          "reservation-idempotency",
          "server-price",
          "order-reuse",
          "invalid-proof-rejected",
          "admin-simulated-capture",
          "confirmed-booking",
          "safe-payment-summary",
          "bookings",
          "cancellation",
          "profile-edit",
          "session-restore",
        ],
      }),
    );
  } finally {
    await Promise.allSettled([(restored ?? client).logout(), admin.logout()]);
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Acceptance failed");
  process.exitCode = 1;
});
