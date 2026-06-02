const p = require('@prisma/client').PrismaClient;
const prisma = new p();
prisma.device.deleteMany().then(r => {
  console.log('Deleted ' + r.count + ' devices');
  prisma.$disconnect();
}).catch(e => {
  console.error(e);
  prisma.$disconnect();
});
