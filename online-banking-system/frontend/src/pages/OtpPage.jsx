import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiErrorMessage } from '../api/client';
import { ErrorBanner } from '../components/ui';

export default function OtpPage() {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { username, devOtp } = location.state || {};

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!username) {
    navigate('/login', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await verifyOtp(username, otp);
      navigate(data.user?.role === 'admin' ? '/admin' : '/', { replace: true });
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
          <h1 className="text-white font-serif text-3xl font-bold">Verify OTP</h1>
          <p className="text-ice text-sm mt-2">Sent to the mobile/email on file for {username}</p>
        </div>
        <div className="bg-white rounded-xl shadow-2xl p-8">
          {devOtp && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-4">
              <strong>Demo mode:</strong> no live SMS/email gateway is connected, so your OTP is shown
              here instead of being sent to a phone: <span className="font-mono font-bold">{devOtp}</span>
            </div>
          )}
          <ErrorBanner message={error} />
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="otp-input" className="block text-sm font-medium text-gray-700 mb-1">6-digit OTP</label>
              <input
                id="otp-input"
                autoComplete="one-time-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full text-center tracking-[0.5em] text-xl border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-navy"
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full py-2.5 rounded-lg bg-navy text-white font-medium hover:bg-navy-light disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
