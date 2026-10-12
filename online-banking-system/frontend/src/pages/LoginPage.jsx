import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { ErrorBanner } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(username, password);
      // devOtp exists because there is no live SMS/email gateway in this
      // build (see README) - it is shown on the next screen for convenience.
      navigate('/otp', { state: { username, devOtp: result.devOtp } });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-white font-serif text-3xl font-bold">Online Banking System</h1>
          <p className="text-ice text-sm mt-2">Sign in to your account</p>
        </div>
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <ErrorBanner message={error} />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                id="login-username"
                autoComplete="username"
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-navy"
                placeholder="e.g. priya"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="login-password"
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-navy"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-navy text-white font-medium hover:bg-navy-light disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Continue'}
            </button>
          </form>
          <p className="text-xs text-gray-400 text-center mt-5">
            Seeded demo accounts: priya / arjun / kavya / meera / admin, password{' '}
            <span className="font-mono">Customer@123</span> (<span className="font-mono">Admin@123</span> for admin)
          </p>
        </div>
      </div>
    </div>
  );
}
