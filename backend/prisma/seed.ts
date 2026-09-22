import { PrismaClient, RoleName } from '@prisma/client';

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

  if (process.env.NODE_ENV === 'development') {
    await seedPrivilegedUser(process.env.DEV_SEED_OWNER_PHONE, RoleName.GYM_OWNER);
    await seedPrivilegedUser(process.env.DEV_SEED_ADMIN_PHONE, RoleName.ADMIN);
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
