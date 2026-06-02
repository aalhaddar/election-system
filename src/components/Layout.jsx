import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import './Layout.css';

const Layout = () => {
  const [orgLogo, setOrgLogo] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('election_token');
    if (!token) return;
    fetch('/api/organization', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.logoUrl) setOrgLogo(d.logoUrl); })
      .catch(() => {});
  }, []);

  return (
    <div className="app-container">
      <header className="app-header">
        {orgLogo && <img src={orgLogo} alt="شعار" className="app-logo" />}
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
