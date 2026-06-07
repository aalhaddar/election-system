# توثيق الكود — نظام إدارة الانتخابات الإلكترونية

> **README.md** → دليل المستخدم (تثبيت، تشغيل، API)
> **SITEMAP.md** → خريطة الموقع والمسارات
> **CODE_DOCS.md** ← **هذا الملف** → توثيق المبرمج (هيكل الكود، التدفق، الشروحات)

---

## فهرس المحتويات

- [هندسة النظام (Architecture)](#هندسة-النظام-architecture)
- [تدفق البيانات العام](#تدفق-البيانات-العام)
- [الواجهة الأمامية — Frontend](#الواجهة-الأمامية--frontend)
  - [App.jsx — حماية المسارات](#appjsx--حماية-المسارات)
  - [StationSelector.jsx — دورة الحياة الكاملة](#stationselectorjsx--دورة-الحياة-الكاملة)
  - [AdminDashboard.jsx — هيكل المودالات](#admindashboardjsx--هيكل-المودالات)
  - [CheckInStation.jsx — إدارة الحالات](#checkinstationjsx--إدارة-الحالات)
  - [VotingStation.jsx — معالج الخطوات](#votingstationjsx--معالج-الخطوات)
  - [LiveDashboard.jsx — التحديث الحي](#livedashboardjsx--التحديث-الحي)
- [الخادم — Backend](#الخادم--backend)
  - [index.js — هيكلة الميدل وير](#indexjs--هيكلة-الميدل-وير)
  - [الأمان والمصادقة](#الأمان-والمصادقة)
  - [نظام التقارير](#نظام-التقارير)
- [Socket.IO — الاتصال الحي](#socketio--الاتصال-الحي)
- [أمثلة تدفق كاملة](#أمثلة-تدفق-كاملة)
- [مخطط العلاقات بين الملفات](#مخطط-العلاقات-بين-الملفات)

---

## هندسة النظام (Architecture)

```
┌──────────────────────────────────────────────────────┐
│                    المتصفح (Cross-Platform)           │
│  ┌────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ React SPA  │  │ Socket.IO│  │  window.print()  │  │
│  │ (Vite Build)│  │ (WebSocket)│  │ (Reports / Receipt)│  │
│  └──────┬─────┘  └────┬─────┘  └──────────────────┘  │
└─────────┼──────────────┼──────────────────────────────┘
          │ HTTP (fetch) │ WebSocket
          ▼              ▼
┌─────────────────────────────────────────────────────────┐
│               Vite Dev Proxy (vite.config.js)            │
│  /api ───────► http://localhost:3001                     │
│  /socket.io ──► http://localhost:3001 (ws: true)        │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│              Express Server (:3001)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ REST API │  │ Socket.IO│  │    Middleware Stack   │  │
│  │ (30+ endpoints)│  │ (4 events)│  │ cors → json → validate → verifyToken│  │
│  └─────┬────┘  └────┬─────┘  │ → requireStation()      │  │
│        │            │        └──────────────────────┘  │
│        ▼            ▼                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Prisma ORM → SQLite (dev.db)             │  │
│  │  User │ Voter │ Candidate │ Position │ Vote     │  │
│  │  ElectionSettings │ Organization │ AuditLog     │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### طبقات النظام

| الطبقة | التقنية | المسؤولية |
|--------|---------|-----------|
| **UI** | React 19 + Vite 8 | واجهة المستخدم (RTL, Arabic) |
| **Router** | React Router v7 | التنقل بين الصفحات، حماية المسارات |
| **Icons** | Lucide React | الرموز والأيقونات |
| **Proxy** | Vite dev server | توجيه API و WebSocket إلى الخادم |
| **HTTP** | Express 5 | REST API + توليد HTML (التقارير) |
| **WebSocket** | Socket.IO 4 | تحديثات حية (stats, waiting list) |
| **ORM** | Prisma 5 | التفاعل مع قاعدة البيانات |
| **DB** | SQLite | تخزين البيانات (ملف واحد) |

### لماذا SQLite وليس PostgreSQL؟

- مشروع محلي / شبكة محلية — لا يحتاج خادم قاعدة بيانات منفصل
- ملف واحد سهل النسخ والتصدير
- Prisma ORM يسمح بالتبديل لاحقاً إلى PostgreSQL/MySQL (بتغيير `provider` فقط)

---

## تدفق البيانات العام

### طلب API نموذجي

```
1. المستخدم يضغط زر → 2. React State يتغير → 3. fetch() يرسل طلب
→ 4. Vite Proxy يستقبل → 5. Express Middleware (cors, json, verifyToken)
→ 6. Route Handler → 7. Prisma Query → 8. SQLite → 9. Response
→ 10. React setState → 11. Re-render → 12. المستخدم يرى التحديث
```

### بث Socket.IO

```
محطة التحقق ← ينفذ check-in ← يرسل "voter_checked_in"
    ↓
الخادم يستقبل ← يبث "update_waiting_list" لجميع المتصفحات
    ↓
LiveDashboard ← يستقبل ← يعيد جلب القائمة
AdminDashboard ← يستقبل ← يحدث الإحصائيات (إذا مفتوح)
```

---

## الواجهة الأمامية — Frontend

### `App.jsx` — حماية المسارات

```jsx
const ProtectedRoute = ({ children, requiredStation }) => {
  const token = localStorage.getItem('election_token');
  const station = localStorage.getItem('election_station');
  
  if (!token) return <Navigate to="/" replace />;
  
  if (requiredStation === 'ADMIN' && station !== '') {
    localStorage.clear();
    return <Navigate to="/" replace />;
  }
  
  if (requiredStation && requiredStation !== 'ADMIN' && station !== requiredStation) {
    localStorage.clear();
    return <Navigate to="/" replace />;
  }
  
  return children;
};
```

**ملاحظة:** الأدمن `station=''`، CHECK_IN `station='CHECK_IN'`، KIOSK `station='KIOSK'`. في `StationSelector.jsx`:
```js
localStorage.setItem('election_station', data.station || '');
```
عندما `data.station` هي `null` (للأدمن)، `null || ''` تعطي `''`.

### `StationSelector.jsx` — دورة الحياة الكاملة

```
useEffect عند تحميل الصفحة:
  هل يوجد election_token في localStorage؟
  ├─ نعم:
  │   ├─ station = '' → /admin
  │   ├─ station = 'CHECK_IN' → /check-in
  │   ├─ station = 'KIOSK' → /vote
  │   └─ أي قيمة أخرى → /dashboard
  └─ لا → ابقَ في الصفحة

المستخدم يضغط على بطاقة محطة:
  └─ handleLogin(e):
      ├─ POST /api/auth/login
      │   ├─ نجاح → حفظ token + station
      │   │   └─ التحقق من station للمحطة المختارة
      │   │   └─ التنقل إلى المسار المناسب
      │   └─ فشل → عرض الخطأ
      └─ زر "تبديل الحساب" (مسح localStorage)
```

**تنبيه:** يستخدم `fetch('http://localhost:3001/api/auth/login', ...)` بعنوان كامل — بينما باقي الملفات تستخدم `const API = ''`. بعد النشر عبر `npm run build`، سيحتاج هذا إلى تغيير لأن الخادم يخدم على نفس البورت.

### `AdminDashboard.jsx` — هيكل المودالات

ملف بـ ~1070 سطر، قلب النظام. ينقسم إلى:

```
الدالة الرئيسية AdminDashboard:
├── States (30+ useState)
│   ├── modals: isVotersModalOpen, isCandidatesModalOpen, isOrgModalOpen, ...
│   ├── data: voters, candidates, positions, stationUsers, orgInfo, ...
│   └── ui: voterSaving, candidateSaving, uploading, uploadResult, ...
│
├── Effects (useEffect)
│   ├── التحميل الأولي: loadVoters(), loadCandidates(), loadPositions()
│   └── Socket.IO listeners
│
├── Handlers
│   ├── CRUD: إضافة/تعديل/حذف ناخب، مرشح، منصب، مستخدم محطة
│   ├── Settings: تصفير، حذف كل الناخبين، حذف كل المترشحين، فتح/إغلاق التصويت
│   └── Utilities: رفع ملف، تحميل نموذج، حفظ المؤسسة
│
└── JSX (10 مودالات + 2 widgets)
    ├─ Candidates, Add Candidate, Edit Candidate
    ├─ Voters (عرض), Edit Voters (تعديل مباشر)
    ├─ Reports, Settings, Positions
    ├─ Organization, Audit Logs
    └─ Add User (محطات)
```

#### نمط المودال الموحد

```jsx
{isSomeModalOpen && (
  <div className="modal-overlay animate-fade-in">
    <div className="custom-modal ... glass-panel">
      <div className="modal-header">
        <h2>العنوان</h2>
        <button className="close-btn" onClick={() => setIsSomeModalOpen(false)}>
          <X size={24} />
        </button>
      </div>
      <div className="modal-body">{/* المحتوى */}</div>
      {footer && <div className="modal-footer">{/* أزرار */}</div>}
    </div>
  </div>
)}
```

**طريقة الفتح:** كل مودال له `isXxxModalOpen` state + دالته الخاصة.

### `CheckInStation.jsx` — إدارة الحالات

يستخدم **state machine** مبسط (متغير `status` واحد بدلاً من 7 متغيرات boolean):

| `status` | متى يحدث | العرض |
|----------|----------|-------|
| `idle` | البداية | شريط البحث فقط |
| `searching` | تم الضغط على بحث | "جاري البحث..." |
| `found` | voter موجود و `NOT_VOTED` | بيانات الناخب + زر "تسجيل الدخول" |
| `not_found` | 404 من API | "الناخب غير موجود" |
| `already_checked_in` | `status: IN_QUEUE` | "مسجل مسبقاً" |
| `already_voted` | `status: VOTED` | "غير مصرح له" |
| `checked_in` | نجاح `POST /check-in` | شاشة نجاح (تختفي بعد 3 ثوانٍ) |
| `error` | خطأ اتصال | رسالة الخطأ |

**تدفق متكامل:**
```
1. إدخال 9 أرقام ← validate: /^\d{9}$/
2. GET /api/voters/lookup/:personalId
3. إذا 404 ← not_found
4. إذا VOTED ← already_voted
5. إذا IN_QUEUE ← already_checked_in
6. إذا NOT_VOTED ← found → زر "تسجيل الدخول للقاعة"
   └─ POST /api/check-in → checked_in
   └─ socket emit "voter_checked_in"
   └─ auto-reset بعد 3 ثوانٍ
```

### `VotingStation.jsx` — معالج الخطوات

```
step = 'start'  ← بطاقة ترحيبية + زر بدء
    │
    ▼
step = 'auth'   ← إدخال 9 أرقام، التحقق من الأهلية
    │              404 → "غير موجود"
    │              VOTED → "صوت مسبقاً"
    │              IN_QUEUE → تابع
    ▼
step = 'voting' ← عرض المناصب والمرشحين (بالصور)
    │              اختيار المرشحين عبر toggleSelection()
    ▼
step = 'review' ← مراجعة الاختيارات
    │              "تعديل" ← voting
    │              "تأكيد" ← handleSubmit
    ▼
step = 'done'   ← POST /api/vote → نجاح
                   socket emit "vote_cast"
                   طباعة إيصال (اختياري)
                   auto-reset بعد 5 ثوانٍ
```

#### `toggleSelection()` — منطق الاختيار

```jsx
const toggleSelection = (positionId, candidateId) => {
  setSelections(prev => {
    const current = prev[positionId] || [];
    const position = positions.find(p => p.id === positionId);
    const max = position ? position.maxSelections : 1;
    
    if (current.includes(candidateId)) {
      // إلغاء اختيار
      return { ...prev, [positionId]: current.filter(id => id !== candidateId) };
    } else {
      // اختيار جديد مع احترام الحد الأقصى
      if (current.length >= max) return prev;  // silent return
      return { ...prev, [positionId]: [...current, candidateId] };
    }
  });
};
```

#### طباعة الإيصال

يُولّد HTML كامل في الذاكرة (بدون طلب خادم) ويُفتح في نافذة جديدة تطبع وتغلق تلقائياً:
```jsx
const printWindow = window.open('', '_blank');
printWindow.document.write(`<!DOCTYPE html>...`);
printWindow.document.close();
// window.onload = () => { window.print(); window.close(); }
```

### `LiveDashboard.jsx` — التحديث الحي

يجمع بين **Socket.IO** (فوري) و **Polling** (fallback):

```jsx
useEffect(() => {
  fetchStats(); fetchWaitingList();

  const interval = setInterval(() => {
    fetchStats(); fetchWaitingList();
  }, 5000);                               // ← استطلاع كل 5 ثوانٍ

  const socket = io(API);
  socket.on('update_stats', () => fetchStats());
  socket.on('update_waiting_list', () => fetchWaitingList());

  return () => {
    clearInterval(interval);
    socket.disconnect();
  };
}, []);
```

---

## الخادم — Backend

### `server/index.js` — هيكلة الميدل وير

```
طلب HTTP
  ├─ cors()                            ← السماح عبر النطاقات
  ├─ express.json({ limit: '50mb' })  ← تحليل JSON (Base64 يحتاج مساحة)
  ├─ validate(schema) (للمسارات المحمية) ← التحقق من صحة المدخلات (zod)
  │
  ├─ verifyToken (للمسارات المحمية)
  │   └─ فك JWT ← req.userId, req.userStation, req.username
  │       └─ requireStation(type) ← التحقق من الصلاحية
  │
  └─ Route Handler
       ├─ Prisma Query
       ├─ logAudit() ← تسجيل
       └─ res.json() ← رد
```

#### `requireStation()` — ميدل وير مصنع

```jsx
const requireStation = (expected) => (req, res, next) => {
  if (!req.userId || req.userStation !== expected) {
    return res.status(403).json({
      error: `يجب تسجيل الدخول بمستخدم ${expected === 'CHECK_IN' ? 'التحقق' : 'الاقتراع'}`
    });
  }
  next();
};
```

يُستخدم لمسارين فقط:
- `POST /api/check-in` ← `requireStation('CHECK_IN')`
- `POST /api/vote` ← `requireStation('KIOSK')`

#### ترتيب المسارات الحرج

```js
// ✅ DELETE /voters/delete-all يُطابق قبل DELETE /voters/:id
app.delete('/api/voters/delete-all', verifyToken, handler);
app.delete('/api/voters/:id', verifyToken, handler);
```

### الأمان والمصادقة

#### JWT

```js
const token = jwt.sign(
  { id: user.id, station: user.station, username: user.username },
  JWT_SECRET,
  { expiresIn: '12h' }
);
```

الحقول في JWT: `id`, `station` (null=ADMIN)، `username`.

#### التحقق من الأدمن

يتكرر في كل مسار CRUD:
```js
if (req.userStation !== null) return res.status(403).json({ error: 'Admin only' });
```
فقط المستخدمون `station=null` يمكنهم تعديل/حذف البيانات.

#### التحقق من صحة الإدخال (Server-Side Validation)
جميع نقاط API التي تستقبل بيانات (`body`, `params`, `query`) محمية الآن عبر `zod`.

**آلية العمل:**
1.  **`server/validation.js`**: هذا الملف يحتوي على "schemas" (مخططات) لكل نوع من البيانات. كل مخطط يصف الشكل الدقيق للبيانات المتوقعة.
    ```javascript
    // مثال: مخطط بيانات الناخب
    const voterSchema = z.object({
      body: z.object({
        personalId: z.string().regex(/^\d{9}$/), // يجب أن يكون 9 أرقام
        name: z.string().min(1),               // لا يمكن أن يكون فارغاً
        membershipType: z.enum(['FULL', 'INCOMPLETE']), // يجب أن يكون إحدى القيمتين
      }),
    });
    ```
2.  **`validate(schema)` Middleware**: ميدل وير وسيط يقوم بتطبيق المخطط على الطلب. إذا كانت البيانات غير متوافقة، يعيد خطأ `400 Bad Request` مع تفاصيل الأخطاء ويمنع الوصول إلى الـ Route Handler.
3.  **التطبيق في `index.js`**:
    ```javascript
    app.post('/api/voters', validate(voterSchema), verifyToken, handler);
    app.put('/api/voters/:id', validate(idParamSchema), validate(voterSchema), verifyToken, handler);
    ```

**لماذا `zod`؟**
-   **Declarative**: يصف "ماذا" تريد، وليس "كيف" تتحقق.
-   **Rich Error Messages**: يوفر رسائل خطأ مفصلة تلقائياً.
-   **Type Safe**: يوفر أساساً قوياً إذا تم الانتقال إلى TypeScript لاحقاً.

#### `logAudit()` — التسجيل غير الحاسم

```js
async function logAudit(action, entity, entityId, details, req) {
  try {
    await prisma.auditLog.create({
      data: {
        action, entity, entityId,
        details: String(details).substring(0, 500),
        userId: req?.userId, station: req?.userStation, username: req?.username
      }
    });
  } catch (e) { /* silently fail */ }
}
```

**متعمّد:** الفشل في التسجيل لا يعطل العملية الأساسية. `substring(0,500)` يمنع تجاوز طول الحقل.

### نظام التقارير

10 تقارير HTML (r1–r10)، تُخدم عبر `GET /api/reports/:id`:

```js
app.get('/api/reports/:id', async (req, res) => {
  const token = req.query.token || req.headers['authorization']?.split(' ')[1];
  // ← يدعم window.open(token في query) و fetch(token في header)
  
  // بناء HTML كامل مع CSS للطباعة
  let html = `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="UTF-8"><style>...@media print...</style>
  </head><body>...</body></html>`;
  
  res.send(html);
});
```

الجدول الكامل:
| id | المحتوى |
|----|---------|
| r1 | كشف بأسماء الناخبين |
| r2 | قائمة المترشحين |
| r3 | عدد الأصوات لكل منصب |
| r4 | عدد الأصوات لكل مرشح |
| r5 | الأصوات لكل منصب مع المرشحين |
| r6 | الأصوات مع صور المرشحين |
| r7 | الأصوات لكل منصب مع الصور |
| r8 | نتائج كاملة مع الصور |
| r9 | نتائج حسب المنصب (فلتر) |
| r10 | نتائج مرشح معين (فلتر) |

---

## Socket.IO — الاتصال الحي

| الحدث | من | إلى | متى |
|-------|----|-----|-----|
| `voter_checked_in` | CheckInStation | الخادم | بعد check-in |
| `vote_cast` | VotingStation | الخادم | بعد تصويت |
| `update_waiting_list` | الخادم | جميع العملاء | عند check-in |
| `update_stats` | الخادم | جميع العملاء | عند تصويت |
| `settings_updated` | الخادم | جميع العملاء | عند فتح/إغلاق التصويت |

**نمط "Fire and Forget":** محطات التحقق والاقتراع تقطع الاتصال فوراً بعد الإرسال:
```jsx
const socket = io(API);
socket.emit('voter_checked_in', data);
socket.disconnect();  // ← لا حاجة لاتصال دائم
```

---

## أمثلة تدفق كاملة

### تدفق 1: Bulk Upload (رفع ملف ناخبين)

```
1. المستخدم يضغط "اختيار ورفع الملف"
2. fileInputRef.current.click() → اختيار ملف
3. handleBulkUpload(e):
   ├─ FileReader → base64
   └─ POST /api/voters/bulk-upload { file: base64 }
4. الخادم:
   ├─ محاولة فتح كـ Excel (xlsx)
   │   └─ فشل → جرب CSV مع iconv-lite (windows-1256 → UTF-8)
   ├─ لكل صف: upsert الناخب (تخطي المكرر)
   └─ res.json({ created, skipped })
5. AdminDashboard: تحديث القائمة والإحصائيات
```

### تدفق 2: تصويت كامل

```
1. مشرف ← فتح التصويت (toggle-voting)
2. ناخب ← CHECK_IN (إدخال ID، "تسجيل الدخول للقاعة")
   ├─ POST /api/check-in → IN_QUEUE
   └─ socket emit → LiveDashboard يرى الناخب
3. ناخب ← KIOSK (إدخال ID)
   ├─ GET /voters/lookup → IN_QUEUE
   ├─ اختيار مرشحين ← POST /api/vote → VOTED
   └─ طباعة إيصال (اختياري)
4. مشرف ← تقارير (/api/reports/r8)
```

### تدفق 3: خطأ — ناخب غير موجود أو مصوت مسبقاً

```
CHECK_IN: إدخال 123456789
GET /api/voters/lookup/123456789 → 404
← "الناخب غير موجود"

KIOSK: إدخال 111111111
GET /api/voters/lookup/111111111 → 200, status: VOTED
← "لقد قمت بالتصويت مسبقاً"

KIOSK: إدخال 222222222
GET /api/voters/lookup/222222222 → 200, status: NOT_VOTED
← "لم يتم تسجيلك في قائمة الانتظار"
```

---

## مخطط العلاقات بين الملفات

```
المستخدم (Browser)
    │
    ├── / ── StationSelector.jsx ── POST /api/auth/login
    │
    ├── /admin ── AdminDashboard.jsx
    │       ── /api/voters/*, /api/candidates/*
    │       ── /api/positions/*, /api/settings/*
    │       ── /api/organization, /api/users/station/*
    │       ── /api/audit-logs, /api/reports/:id
    │       ── socket 'settings_updated'
    │
    ├── /check-in ── CheckInStation.jsx
    │       ── GET /api/voters/lookup/:id
    │       ── POST /api/check-in
    │       ── socket emit 'voter_checked_in'
    │
    ├── /vote ── VotingStation.jsx
    │       ── GET /api/candidates
    │       ── GET /api/voters/lookup/:id
    │       ── POST /api/vote
    │       ── socket emit 'vote_cast'
    │
    └── /dashboard ── LiveDashboard.jsx
            ── GET /api/dashboard/stats, /waiting-list
            ── socket 'update_stats', 'update_waiting_list'

الخادم (server/index.js)
    ├── Prisma → SQLite
    ├── JWT → jsonwebtoken
    ├── Bcrypt
    └── XLSX + iconv-lite

المشترك:
    ├── src/index.css (Global)
    ├── src/components/Layout.jsx + Layout.css
    ├── vite.config.js (Proxy)
    └── package.json
```

---

## أنماط برمجية متكررة

### 1. `useState` + `useEffect` للتحميل الأولي
```jsx
const [data, setData] = useState([]);
useEffect(() => { fetchData(); }, []);
```

### 2. `fetch` مع التوثيق
```jsx
const token = localStorage.getItem('election_token');
const headers = { 'Authorization': `Bearer ${token}` };
const res = await fetch(`${API}/api/endpoint`, { headers });
```

### 3. Socket.IO "Fire and Forget"
```jsx
const socket = io(API);
socket.emit('event', data);
socket.disconnect();
```

### 4. مودال مشروط
```jsx
{isOpen && <div className="modal-overlay">{/* ... */}</div>}
```

---

## إيضاحات لمفاهيم قد تكون غير واضحة

### لماذا `const API = ''`؟

في التطوير: Vite proxy يوجّه `/api` إلى Express (:3001). في الإنتاج: الملفات الثابتة والـ API على نفس الخادم (نفس البورت). لذلك `''` تعمل في الحالتين.

### لماذا Base64 للصور (بدون multipart)؟

لا يحتاج مكتبة رفع ملفات (multer). الصورة مخزنة كنص في SQLite. العيب: أكبر حجماً بـ ~33%.

### لماذا `cuid()` بدلاً من `autoincrement()`؟

معرفات نصية فريدة لا يمكن تخمينها (أمان إضافي)، مناسبة للأنظمة الموزعة.

### لماذا try/catch فارغ في logAudit؟

سجل التدقيق **يجب ألا يعطل العملية الأساسية**. الفشل في التسجيل لا يمنع إضافة ناخب أو تسجيل صوت.

### لماذا جواز التوكن في query string للتقارير؟

`window.open()` لا ترسل headers مخصصة. الحل: تمرير `?token=...` في الرابط.

---

## العقبات المحتملة (Gotchas)

1. **`delete-all` vs `:id`** — المسار الثابت (`delete-all`) يجب أن يكون قبل المسار الديناميكي (`/:id`) في `server/index.js`
2. **`data.station` قد يكون `null`** — `null || ''` يعطي `''`، وهذا يُستخدم لمقارنة الأدمن
3. **Socket.IO disconnect** — محطات الاقتراع تقطع الاتصال فوراً للإرسال فقط (لا استماع)
4. **تشفير CSV** — `iconv-lite` يحول windows-1256 → UTF-8 للملفات القديمة
5. **JSON limit 50mb** — كافٍ للصور Base64 لكنه حد أعلى لجميع الـ requests
6. **جواز التوكن في query string للتقارير** — `window.open()` لا ترسل headers مخصصة. الحل: تمرير `?token=...` في الرابط. هذا لا يزال يمثل ثغرة أمنية محتملة.
