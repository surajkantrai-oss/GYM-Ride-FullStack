// Explicit opt-in local fixture, never invoked by app startup or production builds.
const base = process.env.MOBILE_TEST_API_URL;
if (!base || !['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('A local MOBILE_TEST_API_URL is required');
if (process.env.CREATE_MOBILE_DEV_FIXTURE !== 'true') throw new Error('Explicit development fixture opt-in required');
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return response.json();
}
async function login(phone) {
  if (!phone) throw new Error('Development seed phone missing');
  const challenge = await api('/auth/otp/request', null, { phone });
  if (!challenge.developmentOtp) throw new Error('Development OTP provider required; refusing SMS or production flow');
  const result = await api('/auth/otp/verify', null, { phone, otp: challenge.developmentOtp });
  return result.tokens.accessToken;
}
const owner = await login(process.env.MOBILE_TEST_OWNER_PHONE);
const admin = await login(process.env.MOBILE_TEST_ADMIN_PHONE);
try {
  const name = 'GYMRide Mobile Development Gym';
  const existing = await api(`/partner/gyms?search=${encodeURIComponent(name)}`, owner);
  if (existing.data.some((gym) => gym.name === name)) throw new Error('Fixture already exists; use Partner portal to inspect it, do not duplicate');
  const gym = await api('/partner/gyms', owner, { name, description: 'Local Phase 6 acceptance fixture. Not a real gym or purchasable commercial offering.' });
  const branch = await api(`/partner/gyms/${gym.id}/branches`, owner, { name: 'Development Central', address: 'Local testing address only', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'IN', latitude: '12.9716', longitude: '77.5946', timezone: 'Asia/Kolkata' });
  await api(`/partner/branches/${branch.id}`, owner, { status: 'ACTIVE' }, 'PATCH');
  await api(`/partner/branches/${branch.id}/operating-hours`, owner, { periods: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'].map((weekday) => ({ weekday, isClosed: false, opensAt: '06:00', closesAt: '22:00' })) }, 'PUT');
  await api(`/partner/gyms/${gym.id}/submit`, owner, {});
  await api(`/admin/gyms/${gym.id}/approve`, admin, {});
  await api(`/partner/branches/${branch.id}/slot-config`, owner, { slotDurationMinutes: 60, defaultCapacity: 10, bookingWindowDays: 30, minimumAdvanceMinutes: 0, isActive: true }, 'PUT');
  const plan = await api(`/partner/gyms/${gym.id}/plans`, owner, { name: 'Development day pass', description: 'Simulated local acceptance only', type: 'DAY_PASS', priceMinor: 49900, currency: 'INR', branchIds: [branch.id] });
  await api(`/partner/plans/${plan.id}/activate`, owner, {});
  console.log(JSON.stringify({ gymId: gym.id, branchId: branch.id, planId: plan.id, name }));
} finally {
  await Promise.allSettled([api('/auth/logout', owner, {}), api('/auth/logout', admin, {})]);
}
