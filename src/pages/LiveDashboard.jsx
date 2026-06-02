import { useState, useEffect } from 'react';
import { Users, UserCheck, Clock, Activity } from 'lucide-react';
import { io } from 'socket.io-client';
import './LiveDashboard.css';

const API = '';

const LiveDashboard = () => {
  const [stats, setStats] = useState({ totalVoters: 0, voted: 0, inQueue: 0 });
  const [waitingList, setWaitingList] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API}/api/dashboard/stats`);
      if (res.ok) setStats(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchWaitingList = async () => {
    try {
      const res = await fetch(`${API}/api/dashboard/waiting-list`);
      if (res.ok) setWaitingList(await res.json());
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
    fetchWaitingList();

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      fetchStats();
      fetchWaitingList();
    }, 5000);

    const socket = io(API);

    socket.on('update_stats', () => {
      fetchStats();
    });

    socket.on('update_waiting_list', () => {
      fetchWaitingList();
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const percentage = stats.totalVoters > 0 ? Math.round((stats.voted / stats.totalVoters) * 100) : 0;
  const remaining = stats.totalVoters - stats.voted;

  return (
    <div className="dashboard-container animate-fade-in">
      <div className="dashboard-header">
        <h1 className="text-gradient">المتابعة المباشرة لعملية الاقتراع</h1>
        <div className="live-indicator">
          <Activity size={20} className="animate-pulse" />
          <span>مباشر</span>
        </div>
      </div>

      <div className="dashboard-main-grid">
        <div className="dashboard-left-col">
          <div className="stats-grid">
            <div className="stat-card glass-panel highlight">
              <div className="stat-icon-wrapper blue">
                <Users size={32} />
              </div>
              <div className="stat-info">
                <h3>إجمالي الناخبين</h3>
                <div className="stat-value">{loading ? '...' : stats.totalVoters.toLocaleString()}</div>
              </div>
            </div>

            <div className="stat-card glass-panel highlight">
              <div className="stat-icon-wrapper green">
                <UserCheck size={32} />
              </div>
              <div className="stat-info">
                <h3>المصوتون</h3>
                <div className="stat-value text-green">{loading ? '...' : stats.voted.toLocaleString()}</div>
              </div>
            </div>

            <div className="stat-card glass-panel highlight">
              <div className="stat-icon-wrapper orange">
                <Clock size={32} />
              </div>
              <div className="stat-info">
                <h3>المتبقون</h3>
                <div className="stat-value text-orange">{loading ? '...' : remaining.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <div className="progress-section glass-panel">
            <div className="flex-between progress-header">
              <h2>نسبة المشاركة</h2>
              <span className="percentage-text text-gradient">{percentage}%</span>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${percentage}%` }}
              ></div>
              <div className="progress-glow" style={{ width: `${percentage}%` }}></div>
            </div>
            <p className="progress-subtitle">
              {percentage >= 50 ? 'تم تجاوز نسبة النصاب القانوني (50%)' : 'لم يتم تجاوز نسبة النصاب القانوني بعد'}
            </p>
          </div>
        </div>

        <div className="dashboard-right-col">
          <div className="waiting-list-section glass-panel">
            <div className="waiting-header">
              <div className="flex-between">
                <h2>قائمة الانتظار الحالية</h2>
                <span className="waiting-badge">{waitingList.length} ناخبين</span>
              </div>
              <p>الناخبون المتواجدون حالياً بانتظار أجهزة الاقتراع المتاحة.</p>
            </div>
            
            <div className="waiting-list">
              {waitingList.length === 0 ? (
                <div className="empty-waiting text-center">
                  <UserCheck size={48} className="text-muted mb-4 mx-auto" />
                  <p>لا يوجد ناخبين في قائمة الانتظار حالياً.</p>
                </div>
              ) : (
                waitingList.map((voter) => (
                  <div key={voter.id} className="waiting-item animate-fade-in">
                    <div className="voter-info">
                      <div className="voter-avatar">
                        <Users size={20} />
                      </div>
                      <span className="voter-name">{voter.name}</span>
                    </div>
                    <div className="wait-time">
                      <Clock size={14} className="text-muted" />
                      <span>{voter.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveDashboard;
