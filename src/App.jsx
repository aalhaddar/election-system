import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import StationSelector from './pages/StationSelector';
import AdminDashboard from './pages/AdminDashboard';
import CheckInStation from './pages/CheckInStation';
import VotingStation from './pages/VotingStation';
import LiveDashboard from './pages/LiveDashboard';
import Layout from './components/Layout';
import './App.css';

const ProtectedRoute = ({ children, requiredStation }) => {
  const token = localStorage.getItem('election_token');
  const station = localStorage.getItem('election_station');
  
  if (!token) return <Navigate to="/" replace />;
  if (requiredStation === 'ADMIN' && station !== '') {
    localStorage.removeItem('election_token');
    localStorage.removeItem('election_station');
    return <Navigate to="/" replace />;
  }
  if (requiredStation && requiredStation !== 'ADMIN' && station !== requiredStation) {
    localStorage.removeItem('election_token');
    localStorage.removeItem('election_station');
    return <Navigate to="/" replace />;
  }
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<StationSelector />} />
          <Route path="admin" element={
            <ProtectedRoute requiredStation="ADMIN">
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="check-in" element={
            <ProtectedRoute requiredStation="CHECK_IN">
              <CheckInStation />
            </ProtectedRoute>
          } />
          <Route path="vote" element={
            <ProtectedRoute requiredStation="KIOSK">
              <VotingStation />
            </ProtectedRoute>
          } />
          <Route path="dashboard" element={<LiveDashboard />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
