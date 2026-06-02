import { useState, useRef, useEffect } from 'react';
import { 
  Settings, Lock, Unlock, FileText, MonitorPlay, Users, Plus, Trash2, Power, PowerOff, Upload, UserPlus, Download,
  Building2, UsersRound, FileEdit, LogOut, LayoutDashboard, X, Printer, Eye,
  AlertTriangle, Briefcase, Search, Edit, Monitor, UserCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './AdminDashboard.css';

const API = '';

const REPORT_OPTIONS = [
  { id: 'r1', label: 'تقرير بيانات أعضاء الجمعية العمومية المسجلين' },
  { id: 'r2', label: 'تقرير بأسماء المترشحين' },
  { id: 'r3', label: 'تقرير بأسماء الناخبين المسجلين' },
  { id: 'r4', label: 'تقرير بأسماء المصوتين كاملي العضوية' },
  { id: 'r5', label: 'تقرير بأسماء المصوتين ناقصي العضوية' },
  { id: 'r6', label: 'تقرير بفرز الأصوات الملغية بسبب مخالفة النظام الانتخابي' },
  { id: 'r7', label: 'تقرير بفرز الأصوات لكل المناصب بالتسلسل الهرمي' },
  { id: 'r8', label: 'تقرير بفرز الأصوات لكل المناصب بالصور' },
  { id: 'r9', label: 'تقرير بفرز الأصوات بحسب المنصب', requiresPosition: true },
  { id: 'r10', label: 'تقرير بفرز الأصوات حسب المرشح', requiresCandidate: true },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [votingOpen, setVotingOpen] = useState(false);
  const [stationUsers, setStationUsers] = useState([]);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', station: 'CHECK_IN' });
  const [userSaving, setUserSaving] = useState(false);
  const fileInputRef = useRef(null);

  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCandidatesModalOpen, setIsCandidatesModalOpen] = useState(false);
  const [isVotersModalOpen, setIsVotersModalOpen] = useState(false);
  const [isEditVotersModalOpen, setIsEditVotersModalOpen] = useState(false);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isPositionsModalOpen, setIsPositionsModalOpen] = useState(false);
  const [editingVoter, setEditingVoter] = useState(null);
  const [isAddCandidateModalOpen, setIsAddCandidateModalOpen] = useState(false);
  const [isEditCandidateModalOpen, setIsEditCandidateModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState(null);
  
  const [selectedReportId, setSelectedReportId] = useState('r1');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState('');

  const [candidates, setCandidates] = useState([]);
  const [voters, setVoters] = useState([]);
  const [voterSearch, setVoterSearch] = useState('');

  const [orgInfo, setOrgInfo] = useState({ name: '', electionTitle: '', electionDate: '', logoUrl: '' });
  const [orgSaving, setOrgSaving] = useState(false);

  const [positions, setPositions] = useState([]);
  const [newPosition, setNewPosition] = useState({ title: '', maxSelections: 1 });
  const [positionSaving, setPositionSaving] = useState(false);

  const [newCandidate, setNewCandidate] = useState({
    personalId: '', formNumber: '', name: '', qualifications: '', jobTitle: '', workplace: '', positionId: '', pictureUrl: ''
  });
  const [candidateSaving, setCandidateSaving] = useState(false);

  const [quickStats, setQuickStats] = useState({ checkedIn: 0, voted: 0, inQueue: 0 });
  
  const token = localStorage.getItem('election_token');
  const headers = { 'Authorization': `Bearer ${token}` };

  useEffect(() => {
    if (!token) { navigate('/'); return; }

    const fetchData = async () => {
      try {
        const settingsRes = await fetch(`${API}/api/settings`, { headers });
        if (settingsRes.ok) {
          const d = await settingsRes.json();
          if (d) setVotingOpen(d.isVotingOpen);
        }

        const candsRes = await fetch(`${API}/api/candidates`, { headers });
        if (candsRes.ok) {
          const d = await candsRes.json();
          setCandidates(d.map(c => ({
            id: c.id, personalId: c.personalId, formNo: c.formNumber,
            name: c.name, position: c.position?.title || 'غير محدد',
            qual: c.qualifications, job: c.jobTitle, workplace: c.workplace,
            pic: c.pictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.personalId}`,
            positionId: c.positionId
          })));
        }

        const votersRes = await fetch(`${API}/api/voters`, { headers });
        if (votersRes.ok) setVoters(await votersRes.json());

        const orgRes = await fetch(`${API}/api/organization`, { headers });
        if (orgRes.ok) {
          const d = await orgRes.json();
          setOrgInfo({
            name: d.name || '', electionTitle: d.electionTitle || '',
            electionDate: d.electionDate ? d.electionDate.split('T')[0] : '',
            logoUrl: d.logoUrl || ''
          });
        }

        const posRes = await fetch(`${API}/api/positions`, { headers });
        if (posRes.ok) {
          const d = await posRes.json();
          setPositions(d);
          if (d.length > 0) {
            setSelectedPosition(d[0].title);
            setNewCandidate(prev => ({ ...prev, positionId: d[0].id }));
          }
        }

        const statsRes = await fetch(`${API}/api/dashboard/stats`);
        if (statsRes.ok) {
          const s = await statsRes.json();
          setQuickStats({ checkedIn: s.totalVoters, voted: s.voted, inQueue: s.inQueue });
        }

        const usersRes = await fetch(`${API}/api/users/station`, { headers });
        if (usersRes.ok) setStationUsers(await usersRes.json());
      } catch (err) { console.error('Failed to fetch admin data', err); }
    };
    
    fetchData();

    const socket = io(API);
    socket.on('settings_updated', (updated) => { setVotingOpen(updated.isVotingOpen); });
    return () => socket.disconnect();
  }, [navigate]);

  const handleDeleteUser = async (id) => {
    if (!window.confirm('إزالة هذا المستخدم من النظام؟')) return;
    const res = await fetch(`${API}/api/users/station/${id}`, { method: 'DELETE', headers });
    if (res.ok) setStationUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleToggleUser = async (id) => {
    const res = await fetch(`${API}/api/users/station/${id}/toggle`, { method: 'PUT', headers });
    if (res.ok) {
      const updated = await res.json();
      setStationUsers(prev => prev.map(u => u.id === id ? updated : u));
    }
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return;
    setUserSaving(true);
    try {
      const res = await fetch(`${API}/api/users/station`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        const saved = await res.json();
        setStationUsers(prev => [...prev, saved]);
        setNewUser({ username: '', password: '', station: 'CHECK_IN' });
        setIsUserModalOpen(false);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'فشل في إضافة المستخدم.');
      }
    } catch (err) { console.error(err); }
    setUserSaving(false);
  };

  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleDownloadTemplate = () => {
    window.open(`${API}/api/voters/template`, '_blank');
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    setUploadResult(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target.result;
        const res = await fetch(`${API}/api/voters/bulk-upload`, {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: base64 })
        });
        const data = await res.json();
        if (res.ok) {
          setUploadResult(data);
          const votersRes = await fetch(`${API}/api/voters`, { headers });
          if (votersRes.ok) setVoters(await votersRes.json());
          const statsRes = await fetch(`${API}/api/dashboard/stats`);
          if (statsRes.ok) {
            const s = await statsRes.json();
            setQuickStats({ checkedIn: s.totalVoters, voted: s.voted, inQueue: s.inQueue });
          }
        } else {
          setUploadResult({ error: data.error });
        }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadResult({ error: 'فشل في رفع الملف' });
      setUploading(false);
    }
    e.target.value = null;
  };

  const handleDeleteVoter = async (id) => {
    if (!window.confirm('حذف هذا الناخب من السجل؟')) return;
    await fetch(`${API}/api/voters/${id}`, { method: 'DELETE', headers });
    setVoters(prev => prev.filter(v => v.id !== id));
  };

  const handleEditVoter = async (voter) => {
    if (!/^\d{9}$/.test(voter.personalId)) { alert('الرقم الشخصي يجب أن يكون 9 أرقام'); return; }
    setEditingVoter(voter);
    const res = await fetch(`${API}/api/voters/${voter.id}`, {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(voter)
    });
    if (res.ok) {
      const updated = await res.json();
      setVoters(prev => prev.map(v => v.id === updated.id ? updated : v));
      setEditingVoter(null);
    } else {
      alert('فشل في تحديث بيانات الناخب');
    }
  };

  const handleSaveOrg = async () => {
    setOrgSaving(true);
    try {
      await fetch(`${API}/api/organization`, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(orgInfo)
      });
      setIsOrgModalOpen(false);
    } catch (err) { console.error(err); }
    setOrgSaving(false);
  };

  const handleSavePosition = async () => {
    if (!newPosition.title) return;
    setPositionSaving(true);
    try {
      const res = await fetch(`${API}/api/positions`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newPosition)
      });
      if (res.ok) {
        const saved = await res.json();
        setPositions(prev => [...prev, { ...saved, _count: { candidates: 0 } }]);
        setNewPosition({ title: '', maxSelections: 1 });
      }
    } catch (err) { console.error(err); }
    setPositionSaving(false);
  };

  const handleDeletePosition = async (id) => {
    if (!window.confirm('حذف هذا المنصب؟')) return;
    const res = await fetch(`${API}/api/positions/${id}`, { method: 'DELETE', headers });
    if (res.ok) setPositions(prev => prev.filter(p => p.id !== id));
    else alert('لا يمكن حذف المنصب لوجود مترشحين مرتبطين به.');
  };

  const handleSaveNewCandidate = async () => {
    if (!newCandidate.personalId || !newCandidate.name || !newCandidate.positionId) return;
    setCandidateSaving(true);
    try {
      const res = await fetch(`${API}/api/candidates`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(newCandidate)
      });
      if (res.ok) {
        const saved = await res.json();
        const pos = positions.find(p => p.id === newCandidate.positionId);
        setCandidates(prev => [...prev, {
          id: saved.id, personalId: saved.personalId, formNo: saved.formNumber,
          name: saved.name, position: pos?.title || 'غير محدد',
          qual: saved.qualifications, job: saved.jobTitle, workplace: saved.workplace,
          pic: saved.pictureUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${saved.personalId}`,
          positionId: saved.positionId
        }]);
        setNewCandidate({ personalId: '', formNumber: '', name: '', qualifications: '', jobTitle: '', workplace: '', positionId: positions[0]?.id || '', pictureUrl: '' });
        setIsAddCandidateModalOpen(false);
      } else { alert('حدث خطأ أثناء إضافة المترشح.'); }
    } catch (err) { console.error(err); }
    setCandidateSaving(false);
  };

  const handleDeleteCandidate = async (id) => {
    if (!window.confirm('حذف المترشح؟')) return;
    const res = await fetch(`${API}/api/candidates/${id}`, { method: 'DELETE', headers });
    if (res.ok) setCandidates(prev => prev.filter(c => c.id !== id));
    else alert('فشل في حذف المترشح.');
  };

  const handleResetData = async () => {
    if(window.confirm('تحذير خطير: هل أنت متأكد من تصفير وحذف جميع نتائج الفرز وتسجيل الناخبين؟ هذا الإجراء لا يمكن التراجع عنه.')) {
      try {
        const res = await fetch(`${API}/api/settings/reset`, { method: 'POST', headers });
        if (res.ok) {
          setVoters(prev => prev.map(v => ({ ...v, status: 'NOT_VOTED' })));
          setQuickStats({ checkedIn: quickStats.checkedIn, voted: 0, inQueue: 0 });
          alert('تم تصفير البيانات بنجاح.');
        } else { alert('فشل في تصفير البيانات.'); }
      } catch (err) { console.error(err); }
    }
  };

  const handleDeleteAllVoters = async () => {
    if (!window.confirm('تحذير: هل أنت متأكد من حذف كافة الناخبين؟ هذا الإجراء لا يمكن التراجع عنه وسيحذف جميع الأصوات المرتبطة بهم.')) return;
    try {
      const res = await fetch(`${API}/api/voters/delete-all`, { method: 'DELETE', headers });
      if (res.ok) {
        setVoters([]);
        setQuickStats({ checkedIn: 0, voted: 0, inQueue: 0 });
        alert('تم حذف كافة الناخبين بنجاح.');
      } else { alert('فشل في حذف الناخبين.'); }
    } catch (err) { console.error(err); }
  };

  const handleDeleteAllCandidates = async () => {
    if (!window.confirm('تحذير: هل أنت متأكد من حذف كافة المترشحين؟ هذا الإجراء لا يمكن التراجع عنه وسيحذف جميع الأصوات المرتبطة بهم.')) return;
    try {
      const res = await fetch(`${API}/api/candidates/delete-all`, { method: 'DELETE', headers });
      if (res.ok) {
        setCandidates([]);
        alert('تم حذف كافة المترشحين بنجاح.');
      } else { alert('فشل في حذف المترشحين.'); }
    } catch (err) { console.error(err); }
  };

  const renderUserList = () => {
    return (
      <div className="devices-container scrollable">
        {stationUsers.length === 0 ? (
          <p className="text-muted text-center p-2">لا يوجد مستخدمين للمحطات</p>
        ) : (
          stationUsers.map(u => (
            <div key={u.id} className={`device-row ${u.isActive ? 'active' : 'disabled'}`}>
              <div className="device-info">
                <span className={`status-dot ${u.isActive ? 'active' : 'disabled'}`}></span>
                <span className="device-name">{u.username}</span>
                <span className={`text-sm ${u.station === 'KIOSK' ? 'text-orange' : 'text-green'}`}>
                  {u.station === 'KIOSK' ? 'جهاز اقتراع' : 'محطة تحقق'}
                </span>
                <span className={`status-badge ${u.isActive ? 'active' : 'disabled'}`}>
                  {u.isActive ? 'نشط' : 'موقوف'}
                </span>
              </div>
              <div className="device-actions">
                <button 
                  className={`action-btn ${u.isActive ? 'btn-warn' : 'btn-success-small'}`}
                  onClick={() => handleToggleUser(u.id)}
                  title={u.isActive ? 'إيقاف' : 'تنشيط'}
                >
                  {u.isActive ? <PowerOff size={16} /> : <Power size={16} />}
                </button>
                <button className="action-btn btn-danger-small" onClick={() => handleDeleteUser(u.id)} title="إزالة">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="admin-container animate-fade-in relative">
      <div className="admin-top-bar glass-panel flex-between mb-4">
        <div className="user-info">
          <span className="user-label">المستخدم الحالي:</span>
          <strong className="user-name text-primary">المشرف العام</strong>
        </div>
        <div className="system-title">
          <h2>بوابة الإدارة المركزية للانتخابات</h2>
        </div>
        <div className="datetime text-muted">
          {new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>

      <div className="modules-grid mb-4">
        <button className="module-btn glass-panel" onClick={() => setIsCandidatesModalOpen(true)}>
          <UsersRound size={28} className="module-icon text-primary" />
          <span>بيانات المترشحين</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => setIsVotersModalOpen(true)}>
          <Users size={28} className="module-icon text-success" />
          <span>بيانات الناخبين</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => setIsEditVotersModalOpen(true)}>
          <FileEdit size={28} className="module-icon text-orange" />
          <span>تعديل بيانات الناخبين</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => navigate('/dashboard')}>
          <MonitorPlay size={28} className="module-icon text-primary" />
          <span>منصة المراقبة</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => setIsOrgModalOpen(true)}>
          <Building2 size={28} className="module-icon text-muted" />
          <span>معلومات المؤسسة</span>
        </button>
        <button className="module-btn glass-panel" onClick={async () => { setIsAuditModalOpen(true); try { const r = await fetch(`${API}/api/audit-logs`, { headers }); if (r.ok) setAuditLogs((await r.json()).logs); } catch(e) {} }}>
          <FileText size={28} className="module-icon text-warning" />
          <span>سجل التدقيق (Audit)</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => setIsReportsModalOpen(true)}>
          <FileText size={28} className="module-icon text-success" />
          <span>التقارير الانتخابية</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => setIsSettingsModalOpen(true)}>
          <Settings size={28} className="module-icon text-muted" />
          <span>منصة الإعدادات</span>
        </button>
        <button className="module-btn glass-panel" onClick={() => { localStorage.clear(); navigate('/'); }}>
          <LogOut size={28} className="module-icon text-danger" />
          <span>الخروج</span>
        </button>
      </div>

      <div className="admin-grid mb-4">
        <div className="admin-panel glass-panel control-panel">
          <div className="panel-header">
            <LayoutDashboard size={24} className="text-primary" />
            <h2>حالة التصويت</h2>
          </div>
          <div className="voting-status-box">
            <div className={`status-indicator ${votingOpen ? 'open' : 'closed'}`}>
              {votingOpen ? <Unlock size={48} /> : <Lock size={48} />}
              <h3>{votingOpen ? 'التصويت مفتوح' : 'التصويت مغلق'}</h3>
              <p>{votingOpen ? 'يمكن للناخبين الآن تسجيل الدخول والاقتراع عبر الأجهزة النشطة' : 'النظام مقفل، لا يمكن تسجيل ناخبين جدد أو الاقتراع'}</p>
            </div>
            <button 
              className={`btn btn-large w-full ${votingOpen ? 'btn-danger' : 'btn-success'}`}
              onClick={async () => {
                try {
                  const res = await fetch(`${API}/api/settings/toggle-voting`, { method: 'POST', headers });
                  if (res.ok) { const d = await res.json(); setVotingOpen(d.isVotingOpen); }
                  else { alert('عذراً، حدث خطأ أو لا تملك الصلاحية.'); }
                } catch(err) { console.error(err); }
              }}
            >
              {votingOpen ? 'إغلاق التصويت' : 'فتح باب التصويت'}
            </button>
          </div>
        </div>

        <div className="admin-panel glass-panel device-management-panel">
          <div className="panel-header">
            <Users size={24} className="text-primary" />
            <h2>إدارة مستخدمي المحطات</h2>
            <button className="btn btn-sm btn-outline" onClick={() => setIsUserModalOpen(true)}>
              <Plus size={16} /> إضافة مستخدم
            </button>
          </div>
          <div className="panel-subheader">
            <span className="text-muted text-sm">أنشئ مستخدمين مخصصين لكل محطة (تحقق أو اقتراع)</span>
          </div>
          {renderUserList()}
        </div>

        <div className="admin-panel glass-panel">
          <div className="panel-header">
            <FileText size={24} className="text-primary" />
            <h2>إحصائيات سريعة</h2>
          </div>
          <div className="quick-stats mb-4">
            <div className="q-stat">
              <span className="q-label">إجمالي الناخبين</span>
              <span className="q-val">{quickStats.checkedIn}</span>
            </div>
            <div className="q-stat">
              <span className="q-label">أكملوا الاقتراع</span>
              <span className="q-val">{quickStats.voted}</span>
            </div>
            <div className="q-stat">
              <span className="q-label">قيد الانتظار</span>
              <span className="q-val text-orange">{quickStats.inQueue}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-panel glass-panel full-width-panel">
        <div className="panel-header">
          <Users size={24} className="text-primary" />
          <h2>إدارة سجل الناخبين</h2>
        </div>
        <div className="voter-management-grid">
          <div className="voter-action-card">
            <div className="voter-action-icon blue"><Upload size={32} /></div>
            <div className="voter-action-info">
              <h3>إضافة ناخبين بالجملة (Bulk Upload)</h3>
              <p>رفع ملف Excel أو CSV يحتوي على قائمة بجميع الناخبين المسجلين مسبقاً.</p>
              <div style={{display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem'}}>
                <button className="btn btn-outline" onClick={handleDownloadTemplate} disabled={votingOpen}>
                  <Download size={18} /> تحميل النموذج
                </button>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={handleBulkUpload} />
                <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} disabled={votingOpen || uploading}>
                  <Upload size={18} /> {uploading ? 'جاري الرفع...' : 'اختيار ورفع الملف'}
                </button>
              </div>
              {uploadResult && !uploadResult.error && (
                <div style={{marginTop: '1rem', padding: '0.75rem', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.3)'}}>
                  <p style={{color: '#34d399', fontWeight: 600}}>تم بنجاح: {uploadResult.created} ناخب</p>
                  {uploadResult.skipped > 0 && <p style={{color: '#fbbf24', fontSize: '0.9rem'}}>تم تخطي {uploadResult.skipped} (مكرر)</p>}
                </div>
              )}
              {uploadResult && uploadResult.error && (
                <div style={{marginTop: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.3)'}}>
                  <p style={{color: '#f87171'}}>{uploadResult.error}</p>
                </div>
              )}
              {votingOpen && <p className="text-danger small-text mt-2">* لا يمكن رفع ملفات أثناء عملية التصويت</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Candidates Modal */}
      {isCandidatesModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal candidates-modal glass-panel">
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}>
                <UsersRound size={28} className="text-primary" />
                <h2>بيانات المترشحين ({candidates.length})</h2>
              </div>
              <button className="close-btn" onClick={() => setIsCandidatesModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-toolbar">
              <div className="search-bar glass-panel">
                <Search size={20} className="text-muted" />
                <input type="text" placeholder="ابحث بالاسم أو الرقم الشخصي..." className="search-input" />
              </div>
              <button className="btn btn-primary" onClick={() => setIsAddCandidateModalOpen(true)}>
                <Plus size={18} /> إضافة مترشح جديد
              </button>
            </div>
            <div className="modal-body p-0">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>الصورة</th>
                      <th className="highlight-col">الرقم الشخصي</th>
                      <th>استمارة رقم</th>
                      <th>أسم المرشح</th>
                      <th>مترشح لمنصب</th>
                      <th>المؤهلات العلمية</th>
                      <th>الوظيفة</th>
                      <th>جهة العمل</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((cand) => (
                      <tr key={cand.id}>
                        <td><img src={cand.pic} alt={cand.name} className="candidate-avatar" /></td>
                        <td className="highlight-col font-mono">{cand.personalId}</td>
                        <td className="font-mono">{cand.formNo}</td>
                        <td className="font-bold">{cand.name}</td>
                        <td><span className={`badge ${cand.position === 'رئيس مجلس الإدارة' ? 'badge-primary' : 'badge-default'}`}>{cand.position}</span></td>
                        <td>{cand.qual}</td>
                        <td>{cand.job}</td>
                        <td>{cand.workplace}</td>
                        <td>
                          <div className="table-actions">
                            <button className="action-btn" title="تعديل" onClick={() => { setEditingCandidate(cand); setIsEditCandidateModalOpen(true); }}><Edit size={16} /></button>
                            <button className="action-btn btn-danger-small" title="حذف" onClick={() => handleDeleteCandidate(cand.id)}><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer flex-end">
              <button className="btn btn-outline" onClick={() => setIsCandidatesModalOpen(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {isAddCandidateModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal login-modal glass-panel" style={{maxWidth: '600px'}}>
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><UsersRound size={28} className="text-primary" /><h2>إضافة مترشح جديد</h2></div>
              <button className="close-btn" onClick={() => setIsAddCandidateModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">الرقم الشخصي</label>
                <input type="text" className="select-field w-full" value={newCandidate.personalId} maxLength="9" onChange={e => setNewCandidate(p => ({...p, personalId: e.target.value.replace(/\D/g, '')}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">استمارة رقم</label>
                <input type="text" className="select-field w-full" value={newCandidate.formNumber} onChange={e => setNewCandidate(p => ({...p, formNumber: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">الاسم الكامل</label>
                <input type="text" className="select-field w-full" value={newCandidate.name} onChange={e => setNewCandidate(p => ({...p, name: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">المنصب</label>
                <select className="select-field w-full" value={newCandidate.positionId} onChange={e => setNewCandidate(p => ({...p, positionId: e.target.value}))}>
                  {positions.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">المؤهلات</label>
                <input type="text" className="select-field w-full" value={newCandidate.qualifications} onChange={e => setNewCandidate(p => ({...p, qualifications: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">الوظيفة</label>
                <input type="text" className="select-field w-full" value={newCandidate.jobTitle} onChange={e => setNewCandidate(p => ({...p, jobTitle: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">صورة المترشح (اختياري)</label>
                {newCandidate.pictureUrl && <div className="mb-2"><img src={newCandidate.pictureUrl} alt="صورة" style={{maxWidth:'100px',maxHeight:'100px',borderRadius:'8px'}} /></div>}
                <input type="file" accept="image/*" onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setNewCandidate(p => ({...p, pictureUrl: ev.target.result}));
                  reader.readAsDataURL(file);
                }} />
              </div>
              <div className="form-group mb-4">
                <label className="form-label mb-2 block">جهة العمل</label>
                <input type="text" className="select-field w-full" value={newCandidate.workplace} onChange={e => setNewCandidate(p => ({...p, workplace: e.target.value}))} />
              </div>
              <button className="btn btn-primary btn-large w-full" onClick={handleSaveNewCandidate} disabled={candidateSaving}>
                <Plus size={20} /> {candidateSaving ? 'جاري الحفظ...' : 'حفظ المترشح'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Candidate Modal */}
      {isEditCandidateModalOpen && editingCandidate && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal login-modal glass-panel" style={{maxWidth:'500px'}}>
            <div className="modal-header">
              <div className="flex-center" style={{gap:'1rem'}}><UserCheck size={28} className="text-primary" /><h2>تعديل بيانات المترشح</h2></div>
              <button className="close-btn" onClick={() => { setIsEditCandidateModalOpen(false); setEditingCandidate(null); }}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">استمارة رقم</label>
                <input type="text" className="select-field w-full" value={editingCandidate.formNo} onChange={e => setEditingCandidate(p => ({...p, formNo: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">الرقم الشخصي</label>
                <input type="text" className="select-field w-full" value={editingCandidate.personalId} onChange={e => setEditingCandidate(p => ({...p, personalId: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">اسم المرشح</label>
                <input type="text" className="select-field w-full" value={editingCandidate.name} onChange={e => setEditingCandidate(p => ({...p, name: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">المؤهلات العلمية</label>
                <input type="text" className="select-field w-full" value={editingCandidate.qual} onChange={e => setEditingCandidate(p => ({...p, qual: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">الوظيفة</label>
                <input type="text" className="select-field w-full" value={editingCandidate.job} onChange={e => setEditingCandidate(p => ({...p, job: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">جهة العمل</label>
                <input type="text" className="select-field w-full" value={editingCandidate.workplace} onChange={e => setEditingCandidate(p => ({...p, workplace: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">صورة المترشح</label>
                {editingCandidate.pic && <div className="mb-2"><img src={editingCandidate.pic} alt="صورة" style={{maxWidth:'100px',maxHeight:'100px',borderRadius:'8px'}} /></div>}
                <input type="file" accept="image/*" onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setEditingCandidate(p => ({...p, pic: ev.target.result}));
                  reader.readAsDataURL(file);
                }} />
              </div>
              <button className="btn btn-primary btn-large w-full" onClick={async () => {
                try {
                  const r = await fetch(`${API}/api/candidates/${editingCandidate.id}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({
                    formNo: editingCandidate.formNo,
                    personalId: editingCandidate.personalId,
                    name: editingCandidate.name,
                    qual: editingCandidate.qual,
                    job: editingCandidate.job,
                    workplace: editingCandidate.workplace,
                    pictureUrl: editingCandidate.pic
                  })});
                  if (r.ok) { loadCandidates(); setIsEditCandidateModalOpen(false); setEditingCandidate(null); }
                } catch(e) {}
              }}>
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reports Modal */}
      {isReportsModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal glass-panel">
            <div className="modal-header">
              <h2>عرض / طباعة التقارير الانتخابية</h2>
              <button className="close-btn" onClick={() => setIsReportsModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="reports-list">
                {REPORT_OPTIONS.map(option => (
                  <div key={option.id} className="report-option-container">
                    <label className={`report-radio-label ${selectedReportId === option.id ? 'selected' : ''}`}>
                      <input type="radio" name="report" value={option.id} checked={selectedReportId === option.id} onChange={() => setSelectedReportId(option.id)} />
                      <span className="radio-text">{option.label}</span>
                    </label>
                    {option.requiresPosition && selectedReportId === option.id && (
                      <div className="conditional-input-container animate-fade-in">
                        <select className="input-field select-field" value={selectedPosition} onChange={(e) => setSelectedPosition(e.target.value)}>
                          {positions.map(pos => <option key={pos.id} value={pos.title}>{pos.title}</option>)}
                        </select>
                      </div>
                    )}
                    {option.requiresCandidate && selectedReportId === option.id && (
                      <div className="conditional-input-container animate-fade-in">
                        <p className="hint-text mb-2 text-muted">أختر المرشح لعرض أو طباعة التقرير بفرز الأصوات الخاص به.</p>
                        <select className="input-field select-field list-box" size="4" value={selectedCandidate} onChange={(e) => setSelectedCandidate(e.target.value)}>
                          {candidates.map(cand => <option key={cand.id} value={cand.name}>{cand.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer flex-between">
              <button className="btn btn-outline" onClick={() => setIsReportsModalOpen(false)}><LogOut size={18} /> خروج</button>
              <div className="primary-actions">
                <button className="btn btn-success" onClick={() => {
                  const params = new URLSearchParams();
                  if (selectedReportId === 'r9') params.set('title', selectedPosition);
                  if (selectedReportId === 'r10') params.set('title', selectedCandidate);
                  params.set('token', token);
                  window.open(`${API}/api/reports/${selectedReportId}?${params.toString()}`, '_blank');
                }}><Printer size={18} /> طباعة التقرير</button>
                <button className="btn btn-primary" onClick={() => {
                  const params = new URLSearchParams();
                  if (selectedReportId === 'r9') params.set('title', selectedPosition);
                  if (selectedReportId === 'r10') params.set('title', selectedCandidate);
                  params.set('token', token);
                  window.open(`${API}/api/reports/${selectedReportId}?${params.toString()}`, '_blank');
                }}><Eye size={18} /> عرض التقرير</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal settings-modal glass-panel">
            <div className="modal-header">
              <h2>منصة الإعدادات (Settings)</h2>
              <button className="close-btn" onClick={() => setIsSettingsModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body settings-layout">
              <div className="settings-illustration">
                <div className="illustration-circle">
                  <Settings size={100} className="text-primary animate-pulse" />
                </div>
                <h3>تكوين النظام</h3>
                <p className="text-muted text-center mt-2">يرجى استخدام هذه الإعدادات بحذر لتجنب تغيير مسار العملية الانتخابية.</p>
              </div>
              <div className="settings-buttons">
                <button className="settings-action-btn danger-outline" onClick={handleResetData}>
                  <AlertTriangle size={24} />
                  <span>تصفير وحذف نتائج الفرز و تسجيل الناخبين</span>
                </button>
                <button className="settings-action-btn default-outline" onClick={() => setIsPositionsModalOpen(true)}>
                  <Briefcase size={24} />
                  <span>المناصب الإدارية</span>
                </button>
                <button className="settings-action-btn danger-outline" onClick={handleDeleteAllVoters}>
                  <Users size={24} />
                  <span>حذف كافة الناخبين</span>
                </button>
                <button className="settings-action-btn danger-outline" onClick={handleDeleteAllCandidates}>
                  <UsersRound size={24} />
                  <span>حذف كافة المترشحين</span>
                </button>
              </div>
            </div>
            <div className="modal-footer flex-between">
              <button className="btn btn-outline" onClick={() => setIsSettingsModalOpen(false)}><LogOut size={18} /> الخروج</button>
            </div>
          </div>
        </div>
      )}

      {/* Voters Modal */}
      {isVotersModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal candidates-modal glass-panel">
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><Users size={28} className="text-success" /><h2>بيانات الناخبين ({voters.length})</h2></div>
              <button className="close-btn" onClick={() => setIsVotersModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-toolbar">
              <div className="search-bar glass-panel">
                <Search size={20} className="text-muted" />
                <input type="text" placeholder="ابحث بالاسم أو الرقم الشخصي..." className="search-input" value={voterSearch} onChange={e => setVoterSearch(e.target.value)} />
              </div>
            </div>
            <div className="modal-body p-0">
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr>
                    <th className="highlight-col">الرقم الشخصي</th>
                    <th>الاسم</th>
                    <th>نوع العضوية</th>
                    <th>حالة التصويت</th>
                    <th>إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {voters.filter(v => v.name.includes(voterSearch) || v.personalId.includes(voterSearch)).map(voter => (
                      <tr key={voter.id}>
                        <td className="highlight-col font-mono">{voter.personalId}</td>
                        <td className="font-bold">{voter.name}</td>
                        <td><span className={`badge ${voter.membershipType === 'FULL' ? 'badge-success' : 'badge-default'}`}>{voter.membershipType === 'FULL' ? 'كامل العضوية' : 'ناقص العضوية'}</span></td>
                        <td><span className={`badge ${voter.status === 'VOTED' ? 'badge-primary' : voter.status === 'IN_QUEUE' ? 'badge-warn' : 'badge-default'}`}>{voter.status === 'VOTED' ? 'صوّت' : voter.status === 'IN_QUEUE' ? 'في الانتظار' : 'لم يصوت'}</span></td>
                        <td><div className="table-actions"><button className="action-btn btn-danger-small" onClick={() => handleDeleteVoter(voter.id)}><Trash2 size={16} /></button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer flex-end">
              <button className="btn btn-outline" onClick={() => setIsVotersModalOpen(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Voters Modal */}
      {isEditVotersModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal candidates-modal glass-panel">
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><FileEdit size={28} className="text-orange" /><h2>تعديل بيانات الناخبين ({voters.length})</h2></div>
              <button className="close-btn" onClick={() => setIsEditVotersModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-toolbar">
              <div className="search-bar glass-panel">
                <Search size={20} className="text-muted" />
                <input type="text" placeholder="ابحث بالاسم أو الرقم الشخصي..." className="search-input" value={voterSearch} onChange={e => setVoterSearch(e.target.value)} />
              </div>
            </div>
            <div className="modal-body p-0">
              <div className="table-responsive">
                <table className="data-table">
                  <thead><tr>
                    <th className="highlight-col">الرقم الشخصي</th>
                    <th>الاسم</th>
                    <th>نوع العضوية</th>
                    <th>حالة التصويت</th>
                    <th>تعديل</th>
                  </tr></thead>
                  <tbody>
                    {voters.filter(v => v.name.includes(voterSearch) || v.personalId.includes(voterSearch)).map(voter => (
                      <tr key={voter.id}>
                        {editingVoter?.id === voter.id ? (
                          <>
                            <td><input type="text" className="input-field" style={{width:'120px'}} value={editingVoter.personalId} onChange={e => setEditingVoter(p => ({...p, personalId: e.target.value}))} /></td>
                            <td><input type="text" className="input-field" style={{width:'200px'}} value={editingVoter.name} onChange={e => setEditingVoter(p => ({...p, name: e.target.value}))} /></td>
                            <td>
                              <select className="input-field" value={editingVoter.membershipType} onChange={e => setEditingVoter(p => ({...p, membershipType: e.target.value}))}>
                                <option value="FULL">كامل العضوية</option>
                                <option value="INCOMPLETE">ناقص العضوية</option>
                              </select>
                            </td>
                            <td><span className={`badge ${voter.status === 'VOTED' ? 'badge-primary' : voter.status === 'IN_QUEUE' ? 'badge-warn' : 'badge-default'}`}>{voter.status === 'VOTED' ? 'صوّت' : voter.status === 'IN_QUEUE' ? 'في الانتظار' : 'لم يصوت'}</span></td>
                            <td>
                              <div className="table-actions" style={{gap:'0.5rem'}}>
                                <button className="btn btn-sm btn-success" onClick={() => handleEditVoter(editingVoter)}>حفظ</button>
                                <button className="btn btn-sm btn-outline" onClick={() => setEditingVoter(null)}>إلغاء</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="highlight-col font-mono">{voter.personalId}</td>
                            <td className="font-bold">{voter.name}</td>
                            <td><span className={`badge ${voter.membershipType === 'FULL' ? 'badge-success' : 'badge-default'}`}>{voter.membershipType === 'FULL' ? 'كامل العضوية' : 'ناقص العضوية'}</span></td>
                            <td><span className={`badge ${voter.status === 'VOTED' ? 'badge-primary' : voter.status === 'IN_QUEUE' ? 'badge-warn' : 'badge-default'}`}>{voter.status === 'VOTED' ? 'صوّت' : voter.status === 'IN_QUEUE' ? 'في الانتظار' : 'لم يصوت'}</span></td>
                            <td>
                              <div className="table-actions">
                                <button className="btn btn-sm btn-outline" onClick={() => setEditingVoter({...voter})}><Edit size={16} /> تعديل</button>
                                <button className="action-btn btn-danger-small" onClick={() => handleDeleteVoter(voter.id)}><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer flex-end">
              <button className="btn btn-outline" onClick={() => setIsEditVotersModalOpen(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Organization Modal */}
      {isOrgModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal login-modal glass-panel">
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><Building2 size={28} className="text-primary" /><h2>معلومات المؤسسة</h2></div>
              <button className="close-btn" onClick={() => setIsOrgModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">اسم المؤسسة</label>
                <input type="text" className="select-field w-full" value={orgInfo.name} onChange={e => setOrgInfo(p => ({...p, name: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">عنوان الانتخابات</label>
                <input type="text" className="select-field w-full" value={orgInfo.electionTitle} onChange={e => setOrgInfo(p => ({...p, electionTitle: e.target.value}))} />
              </div>
              <div className="form-group mb-4">
                <label className="form-label mb-2 block">تاريخ الانتخابات</label>
                <input type="date" className="select-field w-full" value={orgInfo.electionDate} onChange={e => setOrgInfo(p => ({...p, electionDate: e.target.value}))} />
              </div>
              <div className="form-group mb-4">
                <label className="form-label mb-2 block">شعار المؤسسة (اختياري)</label>
                {orgInfo.logoUrl && <div className="mb-2"><img src={orgInfo.logoUrl} alt="شعار" style={{maxWidth:'150px', maxHeight:'80px', borderRadius:'8px', border:'1px solid #e2e8f0'}} /></div>}
                <input type="file" accept="image/*" onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => setOrgInfo(p => ({...p, logoUrl: ev.target.result}));
                  reader.readAsDataURL(file);
                }} />
                {orgInfo.logoUrl && <button className="btn btn-sm btn-outline mt-2" onClick={() => setOrgInfo(p => ({...p, logoUrl: ''}))}>إزالة الشعار</button>}
              </div>
              <button className="btn btn-primary btn-large w-full" onClick={handleSaveOrg} disabled={orgSaving}>
                {orgSaving ? 'جاري الحفظ...' : 'حفظ المعلومات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Positions Modal */}
      {isPositionsModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal login-modal glass-panel" style={{maxWidth: '600px'}}>
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><Briefcase size={28} className="text-primary" /><h2>إدارة المناصب الانتخابية</h2></div>
              <button className="close-btn" onClick={() => setIsPositionsModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="device-table mb-4">
                {positions.length === 0 ? <p className="text-muted text-center p-3">لا توجد مناصب بعد.</p> : positions.map(pos => (
                  <div key={pos.id} className="device-row active">
                    <div className="device-info">
                      <span className="device-name">{pos.title}</span>
                      <span className="status-badge active">أقصى {pos.maxSelections} اختيار</span>
                      <span className="text-muted text-sm">({pos._count?.candidates || 0} مترشح)</span>
                    </div>
                    <div className="device-actions">
                      <button className="action-btn btn-danger-small" onClick={() => handleDeletePosition(pos.id)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">اسم المنصب الجديد</label>
                <input type="text" className="select-field w-full" value={newPosition.title} onChange={e => setNewPosition(p => ({...p, title: e.target.value}))} />
              </div>
              <div className="form-group mb-4">
                <label className="form-label mb-2 block">عدد الاختيارات المسموح بها</label>
                <input type="number" min="1" className="select-field w-full" value={newPosition.maxSelections} onChange={e => setNewPosition(p => ({...p, maxSelections: e.target.value}))} />
              </div>
              <button className="btn btn-primary w-full" onClick={handleSavePosition} disabled={positionSaving}>
                <Plus size={18} /> {positionSaving ? 'جاري الإضافة...' : 'إضافة منصب'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Modal */}
      {isAuditModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal candidates-modal glass-panel">
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><FileText size={28} className="text-warning" /><h2>سجل التدقيق (Audit Log)</h2></div>
              <button className="close-btn" onClick={() => setIsAuditModalOpen(false)}><X size={24} /></button>
            </div>
            <div className="modal-body p-0">
              <div className="table-responsive" style={{maxHeight:'60vh', overflowY:'auto'}}>
                {auditLogs.length === 0 ? (
                  <p className="text-muted text-center p-4">لا توجد سجلات</p>
                ) : (
                  <table className="data-table">
                    <thead><tr>
                      <th>التاريخ</th>
                      <th>المستخدم</th>
                      <th>المحطة</th>
                      <th>الإجراء</th>
                      <th>الكيان</th>
                      <th>التفاصيل</th>
                    </tr></thead>
                    <tbody>
                      {auditLogs.map(log => (
                        <tr key={log.id}>
                          <td className="font-mono text-sm">{new Date(log.createdAt).toLocaleString('ar-SA')}</td>
                          <td>{log.username || '—'}</td>
                          <td>{log.station === 'CHECK_IN' ? 'تحقق' : log.station === 'KIOSK' ? 'اقتراع' : 'مشرف'}</td>
                          <td><span className={`badge ${log.action === 'CREATE' ? 'badge-success' : log.action === 'UPDATE' ? 'badge-primary' : log.action === 'DELETE' ? 'badge-warn' : 'badge-default'}`}>{log.action}</span></td>
                          <td>{log.entity}</td>
                          <td style={{maxWidth:'300px', overflow:'hidden', textOverflow:'ellipsis'}}>{log.details || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="modal-footer flex-end">
              <button className="btn btn-outline" onClick={() => setIsAuditModalOpen(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isUserModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal login-modal glass-panel" style={{maxWidth: '450px'}}>
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}><UserPlus size={28} className="text-primary" /><h2>إضافة مستخدم محطة</h2></div>
              <button className="close-btn" onClick={() => { setIsUserModalOpen(false); setNewUser({ username: '', password: '', station: 'CHECK_IN' }); }}><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">اسم المستخدم</label>
                <input type="text" className="select-field w-full" placeholder="مثال: checkin1" value={newUser.username} onChange={e => setNewUser(p => ({...p, username: e.target.value}))} />
              </div>
              <div className="form-group mb-3">
                <label className="form-label mb-2 block">كلمة المرور</label>
                <input type="text" className="select-field w-full" placeholder="أدخل كلمة مرور" value={newUser.password} onChange={e => setNewUser(p => ({...p, password: e.target.value}))} />
              </div>
              <div className="form-group mb-4">
                <label className="form-label mb-2 block">نوع المحطة</label>
                <select className="select-field w-full" value={newUser.station} onChange={e => setNewUser(p => ({...p, station: e.target.value}))}>
                  <option value="CHECK_IN">محطة تحقق (Check-in Station)</option>
                  <option value="KIOSK">جهاز اقتراع (Voting Kiosk)</option>
                </select>
              </div>
              <button className="btn btn-primary btn-large w-full" onClick={handleAddUser} disabled={userSaving}>
                <Plus size={20} /> {userSaving ? 'جاري الحفظ...' : 'إضافة المستخدم'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
