import * as dotenv from 'dotenv';
import * as argon2 from 'argon2';
import dataSource from '../data-source';
import { User } from '../../users/user.entity';
import { Role } from '../../users/role.enum';

dotenv.config();

export async function seedUsers(): Promise<void> {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const reviewerPassword = process.env.SEED_REVIEWER_PASSWORD;
  const salesPassword = process.env.SEED_SALES_PASSWORD;

  if (!adminPassword || !reviewerPassword || !salesPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD, SEED_REVIEWER_PASSWORD, and SEED_SALES_PASSWORD must all be defined',
    );
  }

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  const userRepo = dataSource.getRepository(User);

  const usersToSeed = [
    {
      email: 'admin@example.com',
      fullName: 'System Admin',
      role: Role.ADMIN,
      password: adminPassword,
    },
    {
      email: 'reviewer@example.com',
      fullName: 'Risk Reviewer',
      role: Role.REVIEWER,
      password: reviewerPassword,
    },
    {
      email: 'sales1@example.com',
      fullName: 'Sales Agent One',
      role: Role.SALES,
      password: salesPassword,
    },
    {
      email: 'sales2@example.com',
      fullName: 'Sales Agent Two',
      role: Role.SALES,
      password: salesPassword,
    },
  ];

  for (const item of usersToSeed) {
    const passwordHash = await argon2.hash(item.password, {
      type: argon2.argon2id,
    });
    const normalizedEmail = item.email.trim().toLowerCase();

    const existingUser = await userRepo.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      existingUser.fullName = item.fullName;
      existingUser.role = item.role;
      existingUser.passwordHash = passwordHash;
      existingUser.isActive = true;
      await userRepo.save(existingUser);
    } else {
      const newUser = userRepo.create({
        email: normalizedEmail,
        fullName: item.fullName,
        role: item.role,
        passwordHash,
        isActive: true,
      });
      await userRepo.save(newUser);
    }
  }
}

async function run(): Promise<void> {
  try {
    await seedUsers();

    console.log('Seed completed successfully');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

if (require.main === module) {
  void run();
}
