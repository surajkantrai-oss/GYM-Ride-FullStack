import {
  GymOsBillingInterval,
  GymOsFeature,
  GymOsPlanStatus,
  PrismaClient,
  RoleName,
} from '@prisma/client';

const prisma = new PrismaClient();

const amenities = [
  ['cardio', 'Cardio'],
  ['free-weights', 'Free Weights'],
  ['squat-rack', 'Squat Rack'],
  ['crossfit', 'CrossFit'],
  ['yoga', 'Yoga'],
  ['swimming', 'Swimming'],
  ['shower', 'Shower'],
  ['locker', 'Locker'],
  ['parking', 'Parking'],
  ['steam-room', 'Steam Room'],
  ['personal-trainer', 'Personal Trainer'],
  ['air-conditioning', 'Air Conditioning'],
  ['changing-room', 'Changing Room'],
] as const;

async function main(): Promise<void> {
  await prisma.$transaction([
    ...Object.values(RoleName).map((name) =>
      prisma.role.upsert({ where: { name }, update: {}, create: { name } }),
    ),
    ...amenities.map(([slug, name]) =>
      prisma.amenity.upsert({ where: { slug }, update: { name }, create: { slug, name } }),
    ),
  ]);
  await seedGymOsPlans();

  if (process.env.NODE_ENV === 'development') {
    await seedPrivilegedUser(process.env.DEV_SEED_OWNER_PHONE, RoleName.GYM_OWNER);
    await seedPrivilegedUser(process.env.DEV_SEED_ADMIN_PHONE, RoleName.ADMIN);
  }
}

async function seedGymOsPlans(): Promise<void> {
  const plans = [
    {
      code: 'STARTER',
      legacyCode: 'GYMOS_STARTER',
      name: 'Starter',
      description: 'For small local gyms getting started with digital member management.',
      priceMinor: 59900,
      trialDays: 14,
      memberLimit: 100,
      branchLimit: 1,
      displayOrder: 10,
      features: [
        GymOsFeature.MEMBERS,
        GymOsFeature.MEMBERSHIP_MANAGEMENT,
        GymOsFeature.ATTENDANCE,
        GymOsFeature.RENEWALS,
        GymOsFeature.DUES,
        GymOsFeature.REPORTS,
      ],
    },
    {
      code: 'GROWTH',
      legacyCode: 'GYMOS_GROWTH',
      name: 'Growth',
      description: 'For growing gyms that need automation, analytics, and higher member capacity.',
      priceMinor: 129900,
      trialDays: 0,
      memberLimit: 500,
      branchLimit: 3,
      displayOrder: 20,
      features: Object.values(GymOsFeature),
    },
    {
      code: 'PRO',
      legacyCode: 'GYMOS_PRO',
      name: 'Pro',
      description: 'For large gyms and multi-branch operators.',
      priceMinor: 229900,
      trialDays: 0,
      memberLimit: 5000,
      branchLimit: 20,
      displayOrder: 30,
      features: Object.values(GymOsFeature),
    },
  ];
  for (const item of plans) {
    const { features, legacyCode, ...data } = item;
    await prisma.$transaction(async (tx) => {
      const [current, legacy] = await Promise.all([
        tx.gymOsPlan.findUnique({ where: { code: item.code } }),
        tx.gymOsPlan.findUnique({ where: { code: legacyCode } }),
      ]);
      if (current && legacy && current.id !== legacy.id)
        throw new Error(`Conflicting GymOS plan codes ${item.code} and ${legacyCode}`);

      const values = {
        ...data,
        status: GymOsPlanStatus.ACTIVE,
        billingInterval: GymOsBillingInterval.MONTHLY,
        currency: 'INR',
        archivedAt: null,
      };
      const plan = current
        ? await tx.gymOsPlan.update({ where: { id: current.id }, data: values })
        : legacy
          ? await tx.gymOsPlan.update({ where: { id: legacy.id }, data: values })
          : await tx.gymOsPlan.create({ data: values });

      await tx.gymOsPlanFeature.deleteMany({
        where: { planId: plan.id, feature: { notIn: features } },
      });
      await tx.gymOsPlanFeature.createMany({
        data: features.map((feature) => ({ planId: plan.id, feature })),
        skipDuplicates: true,
      });
    });
  }
}

async function seedPrivilegedUser(phone: string | undefined, roleName: RoleName): Promise<void> {
  if (!phone) return;
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new Error(`${roleName} seed phone must use E.164 format`);
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, status: 'ACTIVE' },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
