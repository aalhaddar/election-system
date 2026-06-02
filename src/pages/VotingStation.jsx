import { useState, useEffect } from 'react';
import { UserCheck, ChevronLeft, Check, LogOut } from 'lucide-react';
import { io } from 'socket.io-client';
import './VotingStation.css';

const API = '';

const VotingStation = () => {
  const [step, setStep] = useState('start');
  const [authId, setAuthId] = useState('');
  const [positions, setPositions] = useState([]);
  const [candidates, setCandidates] = useState({});
  const [selections, setSelections] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadCandidates(); }, []);

    const loadCandidates = () => {
    const token = localStorage.getItem('election_token');
    if (!token) return;
    
    fetch(`${API}/api/candidates`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        const posMap = {};
        const candMap = {};
        data.forEach(c => {
          if (!posMap[c.positionId]) {
            posMap[c.positionId] = {
              id: c.positionId,
              title: c.position.title,
              maxSelections: c.position.maxSelections
            };
            candMap[c.positionId] = [];
          }
          candMap[c.positionId].push({
            id: c.id,
            name: c.name,
            pic: c.pictureUrl || c.pic || '',
            position: c.position?.title || ''
          });
        });
        setPositions(Object.values(posMap));
        setCandidates(candMap);
        
        const initSel = {};
        Object.keys(posMap).forEach(pid => { initSel[pid] = []; });
        setSelections(initSel);
      })
      .catch(err => console.error('Failed to load candidates', err));
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!/^\d{9}$/.test(authId)) { setError('الرقم الشخصي يجب أن يكون 9 أرقام'); return; }
    setError('');
    setLoading(true);
    
    try {
      const res = await fetch(`${API}/api/voters/lookup/${authId}`);
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 404) {
          setError('الناخب غير موجود. الرجاء التوجه لمحطة التحقق أولاً.');
        } else {
          setError('حدث خطأ أثناء البحث');
        }
        setLoading(false);
        return;
      }
      
      if (data.status === 'VOTED') {
        setError('لقد قمت بالتصويت مسبقاً');
        setLoading(false);
        return;
      }
      
      if (data.status !== 'IN_QUEUE') {
        setError('لم يتم تسجيلك في قائمة الانتظار. الرجاء التوجه لمحطة التحقق أولاً.');
        setLoading(false);
        return;
      }
      
      setStep('voting');
    } catch (err) {
      setError('حدث خطأ في الاتصال');
    }
    setLoading(false);
  };

  const toggleSelection = (positionId, candidateId) => {
    setSelections(prev => {
      const current = prev[positionId] || [];
      const position = positions.find(p => p.id === positionId);
      const max = position ? position.maxSelections : 1;
      
      if (current.includes(candidateId)) {
        return { ...prev, [positionId]: current.filter(id => id !== candidateId) };
      } else {
        if (current.length >= max) return prev;
        return { ...prev, [positionId]: [...current, candidateId] };
      }
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch(`${API}/api/vote`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('election_token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalId: authId, selections })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'فشل في تسجيل الصوت');
        setLoading(false);
        return;
      }
      
      const socket = io(API);
      socket.emit('vote_cast', { voterId: data.voter.id });
      socket.disconnect();
      
      setStep('done');
      setTimeout(() => {
        setStep('start');
        setAuthId('');
        const initSel = {};
        positions.forEach(p => { initSel[p.id] = []; });
        setSelections(initSel);
        setError('');
      }, 5000);
    } catch (err) {
      setError('حدث خطأ في الاتصال بالخادم');
    }
    setLoading(false);
  };

  const isAllSelected = () => {
    return positions.every(p => {
      const sel = selections[p.id] || [];
      return sel.length > 0;
    });
  };

  const renderStart = () => (
    <div className="center-content">
      <div className="welcome-box glass-panel text-center">
        <img src="/vite.svg" alt="Logo" className="kiosk-logo animate-pulse" />
        <h1>مرحباً بك في نظام الانتخابات</h1>
        <p className="subtitle">هذا الجهاز مخصص للتصويت في العملية الانتخابية الحالية.</p>
        <button className="btn btn-primary btn-large" onClick={() => setStep('auth')}>
          اضغط لبدء التصويت
        </button>
      </div>
    </div>
  );

  const renderAuth = () => (
    <div className="center-content">
      <div className="auth-box glass-panel text-center">
        <h2>التحقق من الهوية</h2>
        <p>يرجى إدخال رقمك الشخصي</p>
        <form onSubmit={handleAuth}>
          <input 
            type="text" 
            className="input-field text-center large-input mb-4" 
            placeholder="أدخل الرقم الشخصي..."
            value={authId}
            maxLength="9"
            onChange={(e) => setAuthId(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
          {error && <p className="text-danger mb-4">{error}</p>}
          <button type="submit" className="btn btn-primary btn-large w-full" disabled={loading}>
            {loading ? 'جاري التحقق...' : 'تأكيد'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderVoting = () => (
    <div className="voting-layout animate-fade-in">
      <div className="voting-header">
        <h2>شاشة التصويت الإلكتروني</h2>
        <p>يرجى اختيار مرشحيك لكل منصب من المناصب التالية.</p>
      </div>
      
      {positions.map(position => {
        const cands = candidates[position.id] || [];
        const sel = selections[position.id] || [];
        return (
          <div key={position.id} className="ballot-section glass-panel">
            <div className="flex-between">
              <h3 className="position-title">{position.title}</h3>
              <span className="selection-count">
                تم اختيار {sel.length} من {position.maxSelections}
              </span>
            </div>
            <div className="candidates-grid">
              {cands.map(candidate => {
                const isSelected = sel.includes(candidate.id);
                const isDisabled = !isSelected && sel.length >= position.maxSelections;
                return (
                  <div 
                    key={candidate.id}
                    className={`candidate-card ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
                    onClick={() => !isDisabled && toggleSelection(position.id, candidate.id)}
                  >
                    <div className="checkbox">
                      {isSelected && <Check size={20} />}
                    </div>
                    <div className="candidate-info">
                      {candidate.pic && <img src={candidate.pic} alt={candidate.name} className="candidate-img" style={{width:'50px',height:'50px',borderRadius:'50%',objectFit:'cover',marginBottom:'4px'}} />}
                      <span className="candidate-name">{candidate.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && <p className="text-danger text-center">{error}</p>}

      <div className="voting-footer">
        <button 
          className="btn btn-success btn-large" 
          onClick={() => setStep('review')}
          disabled={!isAllSelected()}
        >
          مراجعة التصويت <ChevronLeft />
        </button>
      </div>
    </div>
  );

  const renderReview = () => (
    <div className="center-content">
      <div className="review-box glass-panel animate-fade-in">
        <h2 className="text-center mb-4">مراجعة أصواتك الانتخابية</h2>
        
        {positions.map(position => {
          const sel = selections[position.id] || [];
          const cands = candidates[position.id] || [];
          return (
            <div key={position.id} className="review-section">
              <h4>{position.title}</h4>
              {sel.map(candidateId => {
                const c = cands.find(x => x.id === candidateId);
                return <div key={candidateId} className="review-item">{c?.name || 'غير معروف'}</div>;
              })}
            </div>
          );
        })}

        {error && <p className="text-danger text-center mb-4">{error}</p>}

        <div className="review-actions mt-4">
          <button className="btn btn-outline btn-large" onClick={() => setStep('voting')}>
            تعديل التصويت
          </button>
          <button className="btn btn-primary btn-large" onClick={handleSubmit} disabled={loading}>
            {loading ? 'جاري التصويت...' : 'تأكيد التصويت'}
          </button>
        </div>
      </div>
    </div>
  );

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('يرجى السماح للنوافذ المنبثقة لطباعة الإيصال'); return; }
    const getCandName = (pid, cid) => {
      const cands = candidates[pid] || [];
      const c = cands.find(x => x.id === cid);
      return c?.name || 'غير معروف';
    };
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>إيصال التصويت</title><style>
      body{font-family:sans-serif;padding:2rem;text-align:center;}
      h1{font-size:1.5rem;margin-bottom:0.5rem;}
      h2{font-size:1.2rem;color:#555;margin-bottom:2rem;}
      table{width:100%;border-collapse:collapse;margin:1rem 0;}
      th,td{border:1px solid #ccc;padding:8px;text-align:right;}
      th{background:#f5f5f5;}
      .footer{margin-top:2rem;font-size:0.9rem;color:#999;border-top:1px dashed #ccc;padding-top:1rem;}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact;}}
    </style></head><body>
      <h1>إيصال التصويت الانتخابي</h1>
      <h2>نظام الانتخابات</h2>
      <table><thead><tr><th>المنصب</th><th>المرشح المختار</th></tr></thead><tbody>
    `);
    positions.forEach(position => {
      const sel = selections[position.id] || [];
      sel.forEach(cid => {
        printWindow.document.write(`<tr><td>${position.title}</td><td>${getCandName(position.id, cid)}</td></tr>`);
      });
    });
    printWindow.document.write(`</tbody></table>
      <div class="footer">تم التصويت في ${new Date().toLocaleString('ar-SA')}</div>
      <script>window.onload=function(){window.print();window.close();}<\/script>
    </body></html>`);
    printWindow.document.close();
  };

  const renderDone = () => (
    <div className="center-content">
      <div className="done-box glass-panel text-center animate-fade-in border-success">
        <UserCheck size={64} className="text-success mb-4" />
        <h2>تم التصويت!</h2>
        <p>لقد صوتت بنجاح.</p>
        <button className="btn btn-primary btn-large mt-4" onClick={handlePrint}>
          طباعة إيصال التصويت
        </button>
      </div>
    </div>
  );

  return (
    <div className="kiosk-container">
      <div style={{position:'absolute', top:'1rem', left:'1rem', zIndex:10}}>
        <button className="btn btn-outline btn-sm" onClick={() => { localStorage.removeItem('election_token'); localStorage.removeItem('election_station'); window.location.href = '/'; }}>
          <LogOut size={16} /> خروج
        </button>
      </div>
      {step === 'start' && renderStart()}
      {step === 'auth' && renderAuth()}
      {step === 'voting' && renderVoting()}
      {step === 'review' && renderReview()}
      {step === 'done' && renderDone()}
    </div>
  );
};

export default VotingStation;
