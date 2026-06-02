const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.device.deleteMany().then(r => {
  console.log('Deleted', r.count, 'devices');
  return prisma.$disconnect();
});
