require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const {
  validate,
  idParamSchema,
  personalIdParamSchema,
  loginSchema,
  checkInSchema,
  voteSchema,
  voterSchema,
  candidateSchema,
  positionSchema,
  orgSchema,
  stationUserSchema,
  reportParamsSchema,
} = require('./validation');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-election-key';

// Station middleware factory
const requireStation = (expected) => {
  return (req, res, next) => {
    if (!req.userId || req.userStation !== expected) {
      return res.status(403).json({ error: `يجب تسجيل الدخول بمستخدم ${expected === 'CHECK_IN' ? 'التحقق' : 'الاقتراع'}` });
    }
    next();
  };
};

// Socket.io
io.on('connection', (socket) => {
  socket.on('voter_checked_in', (data) => {
    io.emit('update_waiting_list', data);
  });
  socket.on('vote_cast', (data) => {
    io.emit('update_stats', data);
  });
  socket.on('disconnect', () => {});
});

// Setup initial admin
async function setupInitialData() {
  const adminCount = await prisma.user.count();
  if (adminCount === 0) {
    const hash = await bcrypt.hash('admin', 10);
    await prisma.user.create({
      data: { username: 'admin', passwordHash: hash }
    });
    await prisma.electionSettings.create({
      data: { id: 1, isVotingOpen: false }
    });
  }
}
setupInitialData();

// Auth
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.isActive) return res.status(403).json({ error: 'هذا الحساب موقوف' });
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, station: user.station, username: user.username }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, station: user.station, username: user.username });
});

// Verify JWT
const verifyToken = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(403).json({ error: 'No token provided' });
  jwt.verify(auth.split(' ')[1], JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Unauthorized' });
    req.userId = decoded.id;
    req.userStation = decoded.station;
    req.username = decoded.username;
    next();
  });
};

// Audit log helper
async function logAudit(action, entity, entityId, details, req) {
  try {
    await prisma.auditLog.create({
      data: {
        action, entity, entityId: entityId || null,
        details: details ? String(details).substring(0, 500) : null,
        userId: req?.userId || null,
        station: req?.userStation ?? null,
        username: req?.username || null
      }
    });
  } catch (e) { /* silently fail */ }
}

// ---- KIOSK ENDPOINTS ----

// Lookup voter (read-only, used by both check-in and voting stations)
app.get('/api/voters/lookup/:personalId', async (req, res) => {
  const voter = await prisma.voter.findUnique({ where: { personalId: req.params.personalId } });
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  res.json(voter);
});

// Check-in (requires CHECK_IN station user login)
app.post('/api/check-in', verifyToken, requireStation('CHECK_IN'), async (req, res) => {
  const { personalId } = req.body;
  const settings = await prisma.electionSettings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.isVotingOpen) {
    return res.status(403).json({ error: 'Voting is currently closed' });
  }
  const voter = await prisma.voter.findUnique({ where: { personalId } });
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  if (voter.status === 'VOTED') return res.status(400).json({ error: 'Voter has already voted' });
  if (voter.status === 'IN_QUEUE') return res.json({ voter, message: 'Already checked in' });
  const updated = await prisma.voter.update({
    where: { personalId },
    data: { status: 'IN_QUEUE' }
  });
  await logAudit('CHECK_IN', 'VOTER', updated.id, `تسجيل دخول ${updated.name}`, req);
  io.emit('update_waiting_list', {
    id: updated.id, name: updated.name, time: 'الآن'
  });
  res.json({ voter: updated, message: 'Checked in successfully' });
});

// Vote (requires KIOSK station user login)
app.post('/api/vote', verifyToken, requireStation('KIOSK'), async (req, res) => {
  const { personalId, selections } = req.body;
  const settings = await prisma.electionSettings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.isVotingOpen) {
    return res.status(403).json({ error: 'Voting is currently closed' });
  }
  const voter = await prisma.voter.findUnique({ where: { personalId }, include: { votes: true } });
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  if (voter.status === 'VOTED') return res.status(400).json({ error: 'Voter has already voted' });
  for (const [positionId, candidateIds] of Object.entries(selections)) {
    const position = await prisma.position.findUnique({ where: { id: positionId } });
    if (!position) return res.status(400).json({ error: 'Invalid position' });
    if (candidateIds.length > position.maxSelections || candidateIds.length === 0) {
      return res.status(400).json({ error: `Invalid selection count for ${position.title}` });
    }
    for (const candidateId of candidateIds) {
      const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
      if (!candidate || candidate.positionId !== positionId) {
        return res.status(400).json({ error: 'Invalid candidate' });
      }
      await prisma.vote.create({
        data: { voterId: voter.id, positionId, candidateId }
      });
    }
  }
  const updated = await prisma.voter.update({
    where: { personalId }, data: { status: 'VOTED' }
  });
  await logAudit('VOTE', 'VOTER', updated.id, `تصويت ${updated.name}`, req);
  io.emit('update_stats', { voterId: voter.id });
  io.emit('update_waiting_list');
  res.json({ voter: updated, message: 'Vote recorded successfully' });
});

// ---- DASHBOARD ----
app.get('/api/dashboard/stats', async (req, res) => {
  const [totalVoters, voted, inQueue] = await Promise.all([
    prisma.voter.count(),
    prisma.voter.count({ where: { status: 'VOTED' } }),
    prisma.voter.count({ where: { status: 'IN_QUEUE' } })
  ]);
  res.json({ totalVoters, voted, inQueue });
});

app.get('/api/dashboard/waiting-list', async (req, res) => {
  const waiting = await prisma.voter.findMany({
    where: { status: 'IN_QUEUE' },
    select: { id: true, name: true, personalId: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  res.json(waiting.map(v => ({ id: v.id, name: v.name, personalId: v.personalId, time: 'منذ دقائق' })));
});

// ---- AUTHENTICATED ENDPOINTS ----

app.get('/api/voters', verifyToken, async (req, res) => {
  res.json(await prisma.voter.findMany());
});

app.post('/api/voters', verifyToken, async (req, res) => {
  const { personalId, name, membershipType } = req.body;
  try {
    const voter = await prisma.voter.create({
      data: { personalId, name, membershipType }
    });
    await logAudit('CREATE', 'VOTER', voter.id, `إضافة ناخب ${name}`, req);
    res.json(voter);
  } catch (err) {
    res.status(400).json({ error: 'Voter may already exist' });
  }
});

app.put('/api/voters/:id', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const { personalId, name, membershipType } = req.body;
  try {
    const old = await prisma.voter.findUnique({ where: { id: req.params.id } });
    const voter = await prisma.voter.update({
      where: { id: req.params.id },
      data: { personalId, name, membershipType }
    });
    await logAudit('UPDATE', 'VOTER', voter.id, `تحديث ناخب ${old?.name} -> ${name}`, req);
    res.json(voter);
  } catch (err) {
    res.status(400).json({ error: 'Could not update voter' });
  }
});

app.delete('/api/voters/delete-all', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  await prisma.vote.deleteMany();
  await prisma.voter.deleteMany();
  await logAudit('DELETE', 'VOTER', 'all', 'حذف كافة الناخبين', req);
  res.json({ success: true });
});

app.delete('/api/voters/:id', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const voter = await prisma.voter.findUnique({ where: { id: req.params.id } });
  await prisma.voter.delete({ where: { id: req.params.id } });
  await logAudit('DELETE', 'VOTER', req.params.id, `حذف ناخب ${voter?.name}`, req);
  res.json({ success: true });
});

app.get('/api/candidates', verifyToken, async (req, res) => {
  res.json(await prisma.candidate.findMany({ include: { position: true } }));
});

app.post('/api/candidates', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });

  const { personalId, formNumber, name, qualifications, jobTitle, workplace, pictureUrl, positionId } = req.body;
  try {
    const candidate = await prisma.candidate.create({
      data: { personalId, formNumber, name, qualifications, jobTitle, workplace, pictureUrl, positionId }
    });
    await logAudit('CREATE', 'CANDIDATE', candidate.id, `إضافة مرشح ${name}`, req);
    res.json(candidate);
  } catch (err) {
    res.status(400).json({ error: 'Could not create candidate' });
  }
});

app.put('/api/candidates/:id', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const { personalId, formNumber, name, qualifications, jobTitle, workplace, pictureUrl, positionId } = req.body;
  try {
    const old = await prisma.candidate.findUnique({ where: { id: req.params.id } });
    const candidate = await prisma.candidate.update({
      where: { id: req.params.id },
      data: { personalId, formNumber, name, qualifications, jobTitle, workplace, pictureUrl, positionId }
    });
    await logAudit('UPDATE', 'CANDIDATE', candidate.id, `تحديث مرشح ${old?.name} -> ${name}`, req);
    res.json(candidate);
  } catch (err) {
    res.status(400).json({ error: 'Could not update candidate' });
  }
});

app.delete('/api/candidates/delete-all', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  await prisma.vote.deleteMany();
  await prisma.candidate.deleteMany();
  await logAudit('DELETE', 'CANDIDATE', 'all', 'حذف كافة المترشحين', req);
  res.json({ success: true });
});

app.delete('/api/candidates/:id', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const c = await prisma.candidate.findUnique({ where: { id: req.params.id } });
  await prisma.candidate.delete({ where: { id: req.params.id } });
  await logAudit('DELETE', 'CANDIDATE', req.params.id, `حذف مرشح ${c?.name}`, req);
  res.json({ success: true });
});

app.get('/api/settings', verifyToken, async (req, res) => {
  res.json(await prisma.electionSettings.findUnique({ where: { id: 1 } }));
});

app.post('/api/settings/toggle-voting', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const current = await prisma.electionSettings.findUnique({ where: { id: 1 } });
  const updated = await prisma.electionSettings.update({
    where: { id: 1 }, data: { isVotingOpen: !current.isVotingOpen }
  });
  await logAudit('UPDATE', 'SETTINGS', '1', `${updated.isVotingOpen ? 'فتح' : 'إغلاق'} التصويت`, req);
  io.emit('settings_updated', updated);
  res.json(updated);
});

app.post('/api/settings/reset', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  await prisma.vote.deleteMany();
  await prisma.voter.updateMany({ data: { status: 'NOT_VOTED' } });
  await logAudit('RESET', 'SETTINGS', '1', 'تصفير وحذف نتائج الفرز', req);
  res.json({ success: true });
});

app.get('/api/organization', verifyToken, async (req, res) => {
  let org = await prisma.organization.findUnique({ where: { id: 1 } });
  if (!org) org = await prisma.organization.create({ data: { id: 1 } });
  res.json(org);
});

app.put('/api/organization', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const { name, electionTitle, electionDate, logoUrl } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (electionTitle !== undefined) data.electionTitle = electionTitle;
  if (electionDate !== undefined) data.electionDate = new Date(electionDate);
  if (logoUrl !== undefined) data.logoUrl = logoUrl;
  const updated = await prisma.organization.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, name, electionTitle, electionDate: electionDate ? new Date(electionDate) : null }
  });
  await logAudit('UPDATE', 'ORGANIZATION', '1', 'تحديث معلومات المؤسسة', req);
  res.json(updated);
});

app.get('/api/positions', verifyToken, async (req, res) => {
  res.json(await prisma.position.findMany({ include: { _count: { select: { candidates: true } } } }));
});

app.post('/api/positions', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const { title, maxSelections } = req.body;
  try {
    const position = await prisma.position.create({ data: { title, maxSelections: parseInt(maxSelections) || 1 } });
    res.json(position);
  } catch (err) {
    res.status(400).json({ error: 'Could not create position' });
  }
});

app.delete('/api/positions/:id', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  try {
    await prisma.position.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Cannot delete position with candidates' });
  }
});

// ---- STATION USER MANAGEMENT ----

app.get('/api/users/station', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const users = await prisma.user.findMany({
    where: { station: { not: null } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users.map(u => ({ id: u.id, username: u.username, station: u.station, isActive: u.isActive, createdAt: u.createdAt })));
});

app.post('/api/users/station', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const { username, password, station } = req.body;
  if (!username || !password || (station !== 'CHECK_IN' && station !== 'KIOSK')) {
    return res.status(400).json({ error: 'يجب إدخال اسم مستخدم وكلمة مرور ونوع المحطة (تحقق أو اقتراع)' });
  }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash: hash, station, isActive: true }
  });
  await logAudit('CREATE', 'USER', user.id, `إضافة مستخدم ${username} (${station})`, req);
  res.json({ id: user.id, username: user.username, station: user.station, isActive: user.isActive });
});

app.put('/api/users/station/:id/toggle', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user || !user.station) return res.status(404).json({ error: 'User not found' });
  const updated = await prisma.user.update({
    where: { id: req.params.id }, data: { isActive: !user.isActive }
  });
  await logAudit('UPDATE', 'USER', updated.id, `${updated.isActive ? 'تنشيط' : 'إيقاف'} مستخدم ${user.username}`, req);
  res.json({ id: updated.id, username: updated.username, station: updated.station, isActive: updated.isActive });
});

app.delete('/api/users/station/:id', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user || !user.station) return res.status(404).json({ error: 'User not found' });
  await prisma.user.delete({ where: { id: req.params.id } });
  await logAudit('DELETE', 'USER', req.params.id, `حذف مستخدم ${user.username}`, req);
  res.json({ success: true });
});

// ---- BULK UPLOAD ----

app.get('/api/voters/template', (req, res) => {
  const csv = 'personalId,name,membershipType\n900101111,أحمد محمد عبدالله,FULL\n900202222,سارة خالد أحمد,INCOMPLETE';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="voters_template.csv"');
  res.send('\uFEFF' + csv);
});

app.post('/api/voters/bulk-upload', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const settings = await prisma.electionSettings.findUnique({ where: { id: 1 } });
  if (settings && settings.isVotingOpen) return res.status(403).json({ error: 'Cannot upload during active voting' });

  try {
    const fileData = req.body.file;
    if (!fileData) return res.status(400).json({ error: 'No file provided' });

    let workbook;
    if (typeof fileData === 'string' && fileData.startsWith('data:')) {
      const mimeType = fileData.split(';')[0].split(':')[1];
      const base64 = fileData.split(',')[1];
      const buffer = Buffer.from(base64, 'base64');

      if (mimeType.includes('csv')) {
        const hasUtf8Bom = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF;
        let text;
        if (hasUtf8Bom) {
          text = buffer.slice(3).toString('utf8');
        } else {
          text = buffer.toString('utf8');
          const hasValidHeaders = /personalId|name|membershipType/i.test(text);
          if (!hasValidHeaders) {
            const iconv = require('iconv-lite');
            text = iconv.decode(buffer, 'win1256');
          }
        }
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return res.status(400).json({ error: 'File is empty or has no data rows' });

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const row = {};
          headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
          data.push(row);
        }

        let created = 0, skipped = 0;
        const errors = [];
        for (const row of data) {
          const keys = Object.keys(row);
          const personalId = row['personalId'] || row['PersonalId'] || row['الرقم الشخصي'] || row[keys[0]] || '';
          const name = row['name'] || row['Name'] || row['الاسم'] || row[keys[1]] || '';
          const membershipType = row['membershipType'] || row['MembershipType'] || row['نوع العضوية'] || row[keys[2]] || 'FULL';
          const pid = String(personalId).trim();
          const nm = String(name).trim();
          if (!pid || !nm) { errors.push('Row skipped: missing data'); skipped++; continue; }
          try {
            await prisma.voter.create({ data: { personalId: pid, name: nm, membershipType: membershipType.toUpperCase() === 'INCOMPLETE' ? 'INCOMPLETE' : 'FULL' } });
            created++;
          } catch (err) {
            if (err.code === 'P2002') skipped++;
            else errors.push('Error for ' + pid + ': ' + err.message);
          }
        }
        return res.json({ success: true, created, skipped, errors: errors.slice(0, 10) });
      } else {
        workbook = XLSX.read(buffer, { type: 'buffer' });
      }
    } else {
      return res.status(400).json({ error: 'Invalid file format' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (data.length === 0) return res.status(400).json({ error: 'File is empty' });

    let created = 0, skipped = 0;
    const errors = [];
    for (const row of data) {
      const keys = Object.keys(row);
      const personalId = row['personalId'] || row['PersonalId'] || row['الرقم الشخصي'] || row[keys[0]] || '';
      const name = row['name'] || row['Name'] || row['الاسم'] || row[keys[1]] || '';
      const membershipType = row['membershipType'] || row['MembershipType'] || row['نوع العضوية'] || row[keys[2]] || 'FULL';
      const pid = String(personalId).trim();
      const nm = String(name).trim();
      if (!pid || !nm) { errors.push('Row skipped: missing personalId or name'); skipped++; continue; }
      try {
        await prisma.voter.create({ data: { personalId: pid, name: nm, membershipType: membershipType.toUpperCase() === 'INCOMPLETE' ? 'INCOMPLETE' : 'FULL' } });
        created++;
      } catch (err) {
        if (err.code === 'P2002') skipped++;
        else errors.push('Error for ' + pid + ': ' + err.message);
      }
    }
    res.json({ success: true, created, skipped, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error('Bulk upload error:', err);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// ---- AUDIT LOG ----
app.get('/api/audit-logs', verifyToken, async (req, res) => {
  if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit
  });
  const total = await prisma.auditLog.count();
  res.json({ logs, total, page, limit });
});

// ---- REPORTS ----
app.get('/api/reports/:id', async (req, res) => {
  // Accept token via Authorization header or ?token= query param (for window.open)
  const authHeader = req.headers['authorization'];
  const queryToken = req.query.token;
  const tokenStr = authHeader ? authHeader.split(' ')[1] : queryToken;
  if (!tokenStr) return res.status(403).json({ error: 'No token provided' });
  try {
    jwt.verify(tokenStr, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const reportId = req.params.id;
  const org = await prisma.organization.findUnique({ where: { id: 1 } }) || {};
  const orgName = org.name || 'المؤسسة';
  const orgLogo = org.logoUrl || '';
  const electionTitle = org.electionTitle || 'الانتخابات';
  const electionDate = org.electionDate ? new Date(org.electionDate).toLocaleDateString('ar-SA') : '';

  const allVoters = await prisma.voter.findMany({ orderBy: { personalId: 'asc' } });
  const allCandidates = await prisma.candidate.findMany({ include: { position: true, votes: true }, orderBy: { formNumber: 'asc' } });
  const allPositions = await prisma.position.findMany({ include: { candidates: true }, orderBy: { title: 'asc' } });
  const allVotes = await prisma.vote.findMany({ include: { candidate: { include: { position: true } }, voter: true } });

  const countedIn = (candidateId) => allVotes.filter(v => v.candidateId === candidateId).length;

  const reportConfigs = {
    r1: {
      title: 'بيانات أعضاء الجمعية العمومية المسجلين',
      build: () => ({
        headers: ['الرقم الشخصي', 'الاسم', 'نوع العضوية', 'حالة التصويت'],
        rows: allVoters.map(v => [
          v.personalId, v.name,
          v.membershipType === 'FULL' ? 'كامل العضوية' : 'ناقص العضوية',
          v.status === 'VOTED' ? 'صوّت' : v.status === 'IN_QUEUE' ? 'في الانتظار' : 'لم يصوت'
        ])
      })
    },
    r2: {
      title: 'أسماء المترشحين',
      build: () => ({
        headers: ['استمارة رقم', 'الرقم الشخصي', 'اسم المرشح', 'المنصب', 'المؤهلات', 'الوظيفة', 'جهة العمل'],
        rows: allCandidates.map(c => [
          c.formNumber, c.personalId, c.name, c.position?.title || '',
          c.qualifications, c.jobTitle, c.workplace
        ])
      })
    },
    r3: {
      title: 'أسماء الناخبين المسجلين',
      build: () => ({
        headers: ['الرقم الشخصي', 'الاسم', 'نوع العضوية'],
        rows: allVoters.map(v => [v.personalId, v.name, v.membershipType === 'FULL' ? 'كامل العضوية' : 'ناقص العضوية'])
      })
    },
    r4: {
      title: 'أسماء المصوتين كاملي العضوية',
      build: () => ({
        headers: ['الرقم الشخصي', 'الاسم'],
        rows: allVoters.filter(v => v.status === 'VOTED' && v.membershipType === 'FULL').map(v => [v.personalId, v.name])
      })
    },
    r5: {
      title: 'أسماء المصوتين ناقصي العضوية',
      build: () => ({
        headers: ['الرقم الشخصي', 'الاسم'],
        rows: allVoters.filter(v => v.status === 'VOTED' && v.membershipType === 'INCOMPLETE').map(v => [v.personalId, v.name])
      })
    },
    r6: {
      title: 'فرز الأصوات الملغية بسبب مخالفة النظام الانتخابي',
      build: () => ({
        headers: ['لا توجد أصوات ملغية'],
        rows: [['لم يتم تسجيل أي أصوات ملغية في النظام']]
      })
    },
    r7: {
      title: 'فرز الأصوات لكل المناصب بالتسلسل الهرمي',
      build: () => ({
        headers: ['المنصب', 'المرشح', 'عدد الأصوات'],
        rows: allPositions.flatMap(pos =>
          pos.candidates.length === 0
            ? [[pos.title, '— لا يوجد مرشحون —', '0']]
            : pos.candidates.map(c => [pos.title, c.name, String(countedIn(c.id))])
        )
      })
    },
    r8: {
      title: 'فرز الأصوات لكل المناصب بالصور',
      hasImages: true,
      build: () => ({
        headers: ['المنصب', 'المرشح', 'الصورة', 'عدد الأصوات'],
        rows: allPositions.flatMap(pos =>
          pos.candidates.map(c => [
            pos.title, c.name,
            c.pictureUrl || '',
            String(countedIn(c.id))
          ])
        )
      })
    },
    r9: {
      title: 'فرز الأصوات بحسب المنصب',
      requiresPosition: true,
      build: (posTitle) => {
        const pos = allPositions.find(p => p.title === posTitle);
        if (!pos) return { headers: ['لا توجد بيانات'], rows: [['المنصب المطلوب غير موجود']] };
        return {
          headers: ['المرشح', 'عدد الأصوات', 'النسبة'],
          rows: pos.candidates.map(c => {
            const count = countedIn(c.id);
            const total = allVotes.filter(v => v.positionId === pos.id).length;
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%';
            return [c.name, String(count), pct];
          })
        };
      }
    },
    r10: {
      title: 'فرز الأصوات حسب المرشح',
      requiresCandidate: true,
      build: (candName) => {
        const cand = allCandidates.find(c => c.name === candName);
        if (!cand) return { headers: ['لا توجد بيانات'], rows: [['المرشح المطلوب غير موجود']] };
        const voters = allVotes.filter(v => v.candidateId === cand.id).map(v => v.voter);
        return {
          headers: ['الرقم الشخصي', 'اسم الناخب', 'نوع العضوية'],
          rows: voters.map(v => [v.personalId, v.name, v.membershipType === 'FULL' ? 'كامل العضوية' : 'ناقص العضوية'])
        };
      }
    }
  };

  const config = reportConfigs[reportId];
  if (!config) return res.status(400).json({ error: 'Invalid report ID' });

  const queryTitle = req.query.title || '';
  let result;
  if (config.requiresPosition) result = config.build(queryTitle);
  else if (config.requiresCandidate) result = config.build(queryTitle);
  else result = config.build();

  const headers = result.headers;
  const rows = result.rows;

  const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${config.title} - ${orgName}</title>
<style>
  @media print { @page { size: landscape; margin: 1.5cm; } body { -webkit-print-color-adjust: exact; } }
  body { font-family: 'Amiri', 'Traditional Arabic', serif; margin: 20px; color: #1a1a1a; background: #fff; }
  .report-header { text-align: center; border-bottom: 2px solid #1a365d; padding-bottom: 15px; margin-bottom: 20px; }
  .report-header h1 { font-size: 22px; color: #1a365d; margin: 5px 0; }
  .report-header h2 { font-size: 18px; color: #2d3748; margin: 5px 0; font-weight: normal; }
  .report-header .meta { font-size: 14px; color: #718096; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
  th { background: #1a365d; color: #fff; padding: 10px 8px; text-align: center; font-weight: bold; }
  td { padding: 8px; border: 1px solid #e2e8f0; text-align: center; }
  tr:nth-child(even) { background: #f7fafc; }
  tr:hover { background: #edf2f7; }
  .candidate-img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0; }
  .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #a0aec0; border-top: 1px solid #e2e8f0; padding-top: 15px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
  .badge-green { background: #c6f6d5; color: #22543d; }
  .badge-yellow { background: #fefcbf; color: #744210; }
  .badge-gray { background: #edf2f7; color: #2d3748; }
  .report-logo { max-height: 80px; margin-bottom: 10px; }
</style></head><body>
<div class="report-header">
  ${orgLogo ? `<img src="${orgLogo}" class="report-logo" />` : ''}
  <h1>${orgName}</h1>
  <h2>${config.title}</h2>
  <div class="meta">${electionTitle} ${electionDate ? '— ' + electionDate : ''} | تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}</div>
</div>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
<tbody>${rows.map(row => `<tr>${row.map((cell, i) => {
  if (config.hasImages && i === 2 && cell) return `<td><img src="${cell}" class="candidate-img" onerror="this.style.display='none'" /></td>`;
  return `<td>${cell}</td>`;
}).join('')}</tr>`).join('')}</tbody></table>
<div class="footer">تم إنشاء هذا التقرير بواسطة النظام الانتخابي المركزي — جميع الحقوق محفوظة</div>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ---- START SERVER ----
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('Backend Server running on port ' + PORT);
});
