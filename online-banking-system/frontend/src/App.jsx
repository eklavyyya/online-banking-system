import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';

import LoginPage from './pages/LoginPage';
import OtpPage from './pages/OtpPage';
import DashboardPage from './pages/DashboardPage';
import AccountDetailPage from './pages/AccountDetailPage';
import ProfilePage from './pages/ProfilePage';
import BeneficiariesPage from './pages/BeneficiariesPage';
import TransferPage from './pages/TransferPage';
import BillsPage from './pages/BillsPage';
import DepositsPage from './pages/DepositsPage';
import LoansPage from './pages/LoansPage';
import CardsPage from './pages/CardsPage';
import ServiceRequestsPage from './pages/ServiceRequestsPage';
import NotificationsPage from './pages/NotificationsPage';
import NotFoundPage from './pages/NotFoundPage';

import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminTransactionsPage from './pages/admin/AdminTransactionsPage';
import AdminLoansPage from './pages/admin/AdminLoansPage';
import AdminServiceRequestsPage from './pages/admin/AdminServiceRequestsPage';
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminActivityPage from './pages/admin/AdminActivityPage';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/otp" element={<OtpPage />} />

          {/* Customer area */}
          <Route
            element={
              <ProtectedRoute role="customer">
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/accounts/:id" element={<AccountDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/beneficiaries" element={<BeneficiariesPage />} />
            <Route path="/transfer" element={<TransferPage />} />
            <Route path="/bills" element={<BillsPage />} />
            <Route path="/deposits" element={<DepositsPage />} />
            <Route path="/loans" element={<LoansPage />} />
            <Route path="/cards" element={<CardsPage />} />
            <Route path="/service-requests" element={<ServiceRequestsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          {/* Admin console */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="transactions" element={<AdminTransactionsPage />} />
            <Route path="loans" element={<AdminLoansPage />} />
            <Route path="service-requests" element={<AdminServiceRequestsPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="activity" element={<AdminActivityPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
