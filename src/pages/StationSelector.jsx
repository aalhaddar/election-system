import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CheckSquare, Settings, ShieldAlert, KeyRound, X, LogIn, LogOut } from 'lucide-react';
import './StationSelector.css';

const StationSelector = () => {
  const navigate = useNavigate();
  const [selectedStation, setSelectedStation] = useState(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem('election_token'));

  useEffect(() => {
    const token = localStorage.getItem('election_token');
    const station = localStorage.getItem('election_station');
    if (token) {
      if (station === 'null' || !station) navigate('/admin');
      else if (station === 'CHECK_IN') navigate('/check-in');
      else if (station === 'KIOSK') navigate('/vote');
      else navigate('/dashboard');
    }
  }, [navigate]);

  const stations = [
    {
      id: 'dashboard',
      title: 'شاشة العرض (Dashboard)',
      desc: 'شاشة مخصصة للعرض المباشر في قاعة الانتظار.',
      icon: <LayoutDashboard size={40} />,
      colorClass: 'blue',
      path: '/dashboard'
    },
    {
      id: 'check-in',
      title: 'محطة التحقق (Check-in)',
      desc: 'مخصصة لموظفي الاستقبال للتحقق من هويات الناخبين.',
      icon: <Users size={40} />,
      colorClass: 'green',
      path: '/check-in'
    },
    {
      id: 'vote',
      title: 'جهاز الاقتراع (Voting Kiosk)',
      desc: 'شاشة اللمس المخصصة للناخبين داخل كبينة الاقتراع.',
      icon: <CheckSquare size={40} />,
      colorClass: 'orange',
      path: '/vote'
    },
    {
      id: 'admin',
      title: 'لوحة المشرف (Admin)',
      desc: 'لوحة التحكم الرئيسية لإدارة النظام واستخراج النتائج.',
      icon: <Settings size={40} />,
      colorClass: 'purple',
      path: '/admin'
    }
  ];

  const handleStationClick = (station) => {
    setSelectedStation(station);
    setIsLoginModalOpen(true);
    setLoginError('');
    setUsername('');
    setPassword('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('election_token', data.token);
        localStorage.setItem('election_station', data.station || '');
        
        if (selectedStation.id === 'admin' && data.station !== null) {
          setLoginError('عذراً، حسابك لا يملك صلاحية الدخول للوحة المشرف.');
          return;
        }
        if ((selectedStation.id === 'check-in' && data.station !== 'CHECK_IN') ||
            (selectedStation.id === 'vote' && data.station !== 'KIOSK')) {
          setLoginError('هذا الحساب غير مخصص لهذه المحطة.');
          return;
        }

        setIsLoginModalOpen(false);
        navigate(selectedStation.path);
      } else {
        setLoginError(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
    } catch (err) {
      setLoginError('تعذر الاتصال بالخادم. الرجاء التأكد من تشغيل النظام المركزي.');
    }
  };

  return (
    <div className="selector-container animate-fade-in relative">
      <div className="selector-header text-center">
        <ShieldAlert size={48} className="text-primary mb-4 mx-auto" />
        <h1>نظام إدارة محطات الانتخابات</h1>
        <p>الرجاء اختيار نوع المحطة لتخصيص هذا الجهاز. يتطلب الوصول مصادقة أمنية.</p>
      </div>

      <div className="stations-grid">
        {stations.map((station) => (
          <div 
            key={station.id} 
            className="station-card glass-panel" 
            onClick={() => handleStationClick(station)}
          >
            <div className={`icon-wrapper ${station.colorClass}`}>
              {station.icon}
            </div>
            <h3>{station.title}</h3>
            <p>{station.desc}</p>
          </div>
        ))}
      </div>

      {loggedIn && (
        <div style={{textAlign: 'left', marginBottom: '1rem'}}>
          <button className="btn btn-outline btn-sm" onClick={() => { localStorage.removeItem('election_token'); localStorage.removeItem('election_station'); setLoggedIn(false); window.location.reload(); }}>
            <LogOut size={16} /> تبديل الحساب
          </button>
        </div>
      )}

      {isLoginModalOpen && (
        <div className="modal-overlay animate-fade-in">
          <div className="custom-modal login-modal glass-panel">
            <div className="modal-header">
              <div className="flex-center" style={{gap: '1rem'}}>
                <KeyRound size={28} className="text-primary" />
                <h2>مصادقة الدخول - {selectedStation?.title}</h2>
              </div>
              <button className="close-btn" onClick={() => setIsLoginModalOpen(false)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="login-illustration mb-4 text-center">
                 <div className={`icon-wrapper mx-auto mb-3 ${selectedStation?.colorClass}`}>
                    {selectedStation?.icon}
                 </div>
                 <p className="text-muted text-sm">الرجاء إدخال بيانات الاعتماد الخاصة بك للوصول إلى هذه المحطة.</p>
              </div>

              <form onSubmit={handleLogin} className="login-form">
                <div className="form-group mb-3">
                  <label className="form-label mb-2 block">اسم المستخدم</label>
                  <input 
                    type="text" 
                    className="input-field select-field w-full" 
                    placeholder="أدخل اسم المستخدم..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                
                <div className="form-group mb-4">
                  <label className="form-label mb-2 block">كلمة المرور</label>
                  <input 
                    type="password" 
                    className="input-field select-field w-full" 
                    placeholder="أدخل كلمة المرور..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {loginError && (
                  <div className="login-error mb-4 p-3 rounded bg-danger-transparent text-danger text-sm border-danger">
                    {loginError}
                  </div>
                )}
                
                <button type="submit" className="btn btn-primary btn-large w-full">
                  <LogIn size={20} /> تسجيل الدخول
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default StationSelector;
