import React, { useSyncExternalStore } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth.js';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { T } from './theme.js';
import { roleHome } from './lib/roleHome.js';
import { getLang, subscribeLang } from './i18n.js';

/* Auth / public */
import Landing from './screens/Landing.jsx';
import Login from './screens/Login.jsx';
import Register from './screens/Register.jsx';
import PrivacyPolicy from './screens/PrivacyPolicy.jsx';
import TermsOfService from './screens/TermsOfService.jsx';
import DataRights from './screens/DataRights.jsx';
import SecurityReadiness from './screens/SecurityReadiness.jsx';
import GoogleOnboarding from './screens/GoogleOnboarding.jsx';
import AccountLink from './screens/AccountLink.jsx';
import HospitalPending from './screens/HospitalPending.jsx';

/* Donor */
import DonorHome from './screens/DonorHome.jsx';
import DonorAlert from './screens/DonorAlert.jsx';
import DonorOnTheWay from './screens/DonorOnTheWay.jsx';
import DonorCredits from './screens/DonorCredits.jsx';
import DonorProfile from './screens/DonorProfile.jsx';
import DonorHistory from './screens/DonorHistory.jsx';
import DonorRequests from './screens/DonorRequests.jsx';

/* Hospital Console */
import Console from './screens/Console.jsx';
import ConsoleNewRequest from './screens/ConsoleNewRequest.jsx';
import ConsoleVerify from './screens/ConsoleVerify.jsx';

/* Admin */
import AdminDashboard from './screens/AdminDashboard.jsx';
import NotFound from './screens/NotFound.jsx';
import { ForgotPassword, ResetPassword, VerifyEmail } from './screens/AccountRecovery.jsx';
import ConsoleRequest from './screens/ConsoleRequest.jsx';

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/privacy',
  '/terms',
  '/data-rights',
  '/security-readiness',
  '/google-onboarding',
  '/account-link',
  '/hospital-pending',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);

function App() {
  const { user, loading } = useAuth();
  useSyncExternalStore(subscribeLang, getLang); // re-render every screen on language change
  const location = useLocation();
  const isPublic = PUBLIC_PATHS.has(location.pathname);
  const isDarkPublic = location.pathname === '/' || location.pathname === '/login';

  // Only block protected routes while the session is resolving.
  if (loading && !isPublic) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh',
        fontFamily: "'Public Sans', 'Segoe UI', system-ui, sans-serif", color: T.mut,
        background: T.porcelain,
      }}>
        Loading RaktaSetu...
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: "'Public Sans', 'Segoe UI', system-ui, sans-serif",
      background: isDarkPublic ? '#0A0506' : T.porcelain,
      minHeight: '100vh',
      color: T.ink,
    }}>
      <div className={location.pathname.startsWith('/admin') || location.pathname.startsWith('/console') ? 'app-shell app-shell--wide app-shell--console-dark' : (isPublic ? 'app-shell app-shell--fluid' : 'app-shell')}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={user ? <Navigate to={roleHome(user)} replace /> : <Landing />} />
          <Route path="/login" element={user ? <Navigate to={roleHome(user)} replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to={roleHome(user)} replace /> : <Register />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/data-rights" element={<DataRights />} />
          <Route path="/security-readiness" element={<SecurityReadiness />} />
          <Route path="/google-onboarding" element={user ? <Navigate to={roleHome(user)} replace /> : <GoogleOnboarding />} />
          <Route
            path="/account-link"
            element={
              user && !sessionStorage.getItem('google_link_token')
                ? <Navigate to={roleHome(user)} replace />
                : <AccountLink />
            }
          />
          <Route path="/hospital-pending" element={<HospitalPending />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />

          {/* Donor routes */}
          <Route path="/home" element={
            <ProtectedRoute user={user} role="donor">
              <DonorHome />
            </ProtectedRoute>
          } />
          <Route path="/alert/:requestId" element={
            <ProtectedRoute user={user} role="donor">
              <DonorAlert />
            </ProtectedRoute>
          } />
          <Route path="/on-the-way/:requestId" element={
            <ProtectedRoute user={user} role="donor">
              <DonorOnTheWay />
            </ProtectedRoute>
          } />
          <Route path="/credits" element={
            <ProtectedRoute user={user} role="donor">
              <DonorCredits />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute user={user} role="donor">
              <DonorProfile />
            </ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute user={user} role="donor">
              <DonorHistory />
            </ProtectedRoute>
          } />
          <Route path="/requests" element={
            <ProtectedRoute user={user} role="donor">
              <DonorRequests />
            </ProtectedRoute>
          } />

          {/* Hospital routes */}
          <Route path="/console" element={
            <ProtectedRoute user={user} role="hospital">
              <Console />
            </ProtectedRoute>
          } />
          <Route path="/console/new-request" element={
            <ProtectedRoute user={user} role="hospital">
              <ConsoleNewRequest />
            </ProtectedRoute>
          } />
          <Route path="/console/verify" element={
            <ProtectedRoute user={user} role="hospital">
              <ConsoleVerify />
            </ProtectedRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin" element={
            <ProtectedRoute user={user} role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="/console/requests/:requestId" element={
            <ProtectedRoute user={user} role="hospital">
              <ConsoleRequest />
            </ProtectedRoute>
          } />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
