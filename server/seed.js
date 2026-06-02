const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding database...');

  // Create Positions
  const pos1 = await prisma.position.create({
    data: { title: 'رئيس مجلس الإدارة', maxSelections: 1 }
  });
  const pos2 = await prisma.position.create({
    data: { title: 'نائب الرئيس', maxSelections: 1 }
  });
  const pos3 = await prisma.position.create({
    data: { title: 'أعضاء مجلس الإدارة', maxSelections: 5 }
  });
  
  console.log('Positions created.');

  // Create Candidates
  await prisma.candidate.create({
    data: {
      personalId: '980102345',
      formNumber: '101',
      name: 'الشيخ علي مكي حبيب',
      qualifications: 'دكتوراه',
      jobTitle: 'أستاذ جامعي',
      workplace: 'جامعة البحرين',
      pictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ali',
      positionId: pos1.id
    }
  });

  await prisma.candidate.create({
    data: {
      personalId: '950203456',
      formNumber: '102',
      name: 'محمد عيسى',
      qualifications: 'ماجستير',
      jobTitle: 'مهندس',
      workplace: 'وزارة الأشغال',
      pictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mohammed',
      positionId: pos2.id
    }
  });

  await prisma.candidate.create({
    data: {
      personalId: '920304567',
      formNumber: '103',
      name: 'محمد عبدالله منصور',
      qualifications: 'بكالوريوس',
      jobTitle: 'محاسب',
      workplace: 'بنك البحرين',
      pictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mansoor',
      positionId: pos3.id
    }
  });

  await prisma.candidate.create({
    data: {
      personalId: '890405678',
      formNumber: '104',
      name: 'حسن أحمد عبدالله جمعة',
      qualifications: 'ثانوية عامة',
      jobTitle: 'رجل أعمال',
      workplace: 'عمل حر',
      pictureUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Hassan',
      positionId: pos3.id
    }
  });
  
  console.log('Candidates created.');

  // Create Mock Voters
  const mockVoters = [
    { personalId: '800101234', name: 'أحمد محمد عبدالله', membershipType: 'FULL' },
    { personalId: '820202345', name: 'سارة خالد أحمد', membershipType: 'FULL' },
    { personalId: '850303456', name: 'فهد عبدالعزيز الشمري', membershipType: 'INCOMPLETE' },
    { personalId: '900404567', name: 'نورة سالم الدوسري', membershipType: 'FULL' }
  ];

  for (const voter of mockVoters) {
    await prisma.voter.create({ data: voter });
  }

  console.log('Voters created.');
  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
