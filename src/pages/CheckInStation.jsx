import { useState } from 'react';
import { Search, UserCheck, AlertCircle, CheckCircle2, LogOut } from 'lucide-react';
import { io } from 'socket.io-client';
import './CheckInStation.css';

const API = '';

const CheckInStation = () => {
  const token = localStorage.getItem('election_token');
  const authHeaders = { 'Authorization': `Bearer ${token}` };
  const [personalId, setPersonalId] = useState('');
  const [voter, setVoter] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!personalId) return;
    if (!/^\d{9}$/.test(personalId)) { setError('الرقم الشخصي يجب أن يكون 9 أرقام'); setStatus('error'); return; }
    setError('');
    setVoter(null);
    setStatus('searching');
    
    try {
      const res = await fetch(`${API}/api/voters/lookup/${personalId}`);
      const data = await res.json();
      
      if (!res.ok) {
        setStatus('not_found');
        setError(data.error || 'الناخب غير موجود');
        return;
      }
      
      setVoter(data);
      
      if (data.status === 'VOTED') {
        setStatus('already_voted');
      } else if (data.status === 'IN_QUEUE') {
        setStatus('already_checked_in');
      } else {
        setStatus('found');
      }
    } catch (err) {
      setStatus('error');
      setError('حدث خطأ في الاتصال.');
    }
  };

  const handleCheckIn = async () => {
    try {
      const res = await fetch(`${API}/api/check-in`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalId })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || 'فشل في تسجيل الدخول');
        return;
      }
      
      setStatus('checked_in');
      
      const socket = io(API);
      socket.emit('voter_checked_in', {
        id: data.voter.id,
        name: data.voter.name,
        time: 'الآن'
      });
      socket.disconnect();
      
      setTimeout(() => {
        setPersonalId('');
        setVoter(null);
        setStatus('idle');
        setError('');
      }, 3000);
    } catch (err) {
      setError('حدث خطأ أثناء تسجيل الدخول');
    }
  };

  return (
    <div className="checkin-container animate-fade-in">
      <div className="checkin-header">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <div>
            <h1>محطة التحقق من البيانات</h1>
            <p>الرجاء إدخال الرقم الشخصي للتحقق من أحقية الناخب</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => { localStorage.removeItem('election_token'); localStorage.removeItem('election_station'); window.location.href = '/'; }}>
            <LogOut size={16} /> خروج
          </button>
        </div>
      </div>

      <div className="search-section glass-panel">
        <form onSubmit={handleSearch} className="search-form">
          <div className="input-wrapper">
            <Search className="input-icon" size={20} />
            <input 
              type="text" 
              className="input-field" 
              placeholder="أدخل الرقم الشخصي..."
              value={personalId}
              maxLength="9"
              onChange={(e) => setPersonalId(e.target.value.replace(/\D/g, ''))}
              disabled={status === 'searching' || status === 'checked_in'}
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary search-btn"
            disabled={status === 'searching' || status === 'checked_in'}
          >
            {status === 'searching' ? 'جاري البحث...' : 'بحث وتحقق'}
          </button>
        </form>
      </div>

      {error && status !== 'checked_in' && (
        <div className="result-card error glass-panel animate-fade-in">
          <AlertCircle size={48} className="text-danger mb-4" />
          <h2>خطأ</h2>
          <p>{error}</p>
        </div>
      )}

      {status === 'found' && voter && (
        <div className="result-card glass-panel animate-fade-in">
          <div className="voter-details">
            <div className="avatar-placeholder">
              <UserCheck size={40} />
            </div>
            <div className="info">
              <h2>{voter.name}</h2>
              <div className="tags">
                <span className="tag">الرقم الشخصي: {voter.personalId}</span>
                <span className="tag blue">{voter.membershipType === 'FULL' ? 'كامل العضوية' : 'ناقص العضوية'}</span>
              </div>
            </div>
          </div>

          <div className="status-section">
            <div className="action-area">
              <div className="alert-box success">
                <CheckCircle2 size={24} />
                <div>
                  <strong>مصرح له بالتصويت</strong>
                  <p>يمكنه استلام بطاقة الدخول لقاعة الاقتراع.</p>
                </div>
              </div>
              <button className="btn btn-success confirm-btn" onClick={handleCheckIn}>
                تسجيل الدخول للقاعة
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'already_checked_in' && voter && (
        <div className="result-card glass-panel animate-fade-in">
          <div className="voter-details">
            <div className="avatar-placeholder">
              <UserCheck size={40} />
            </div>
            <div className="info">
              <h2>{voter.name}</h2>
              <div className="tags">
                <span className="tag">الرقم الشخصي: {voter.personalId}</span>
              </div>
            </div>
          </div>
          <div className="alert-box success">
            <CheckCircle2 size={24} />
            <div>
              <strong>تم تسجيل الدخول مسبقاً</strong>
              <p>هذا الناخب موجود بالفعل في قائمة الانتظار.</p>
            </div>
          </div>
        </div>
      )}

      {status === 'already_voted' && voter && (
        <div className="result-card glass-panel animate-fade-in">
          <div className="voter-details">
            <div className="avatar-placeholder">
              <UserCheck size={40} />
            </div>
            <div className="info">
              <h2>{voter.name}</h2>
              <div className="tags">
                <span className="tag">الرقم الشخصي: {voter.personalId}</span>
              </div>
            </div>
          </div>
          <div className="alert-box error">
            <AlertCircle size={24} />
            <div>
              <strong>غير مصرح له بالتصويت</strong>
              <p>هذا الناخب قام بالتصويت مسبقاً.</p>
            </div>
          </div>
        </div>
      )}

      {status === 'checked_in' && (
        <div className="success-overlay animate-fade-in">
          <div className="success-content glass-panel">
            <CheckCircle2 size={64} className="text-green mb-4 animate-pulse" />
            <h2>تم تسجيل الدخول بنجاح</h2>
            <p>يمكن للناخب الآن التوجه إلى أجهزة الاقتراع.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckInStation;
