import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const client = axios.create({ baseURL: API_URL });

// Attach the JWT (if present) to every outgoing request.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('obs_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 means the session is invalid/expired - clear it and let the UI
// route back to login rather than showing a confusing stuck screen.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('obs_token');
      localStorage.removeItem('obs_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

// Normalizes the error shape the backend sends ({ error: "message" }) into
// a plain string, so every page can just do `catch (err) { setError(err) }`.
export function apiErrorMessage(err) {
  return err?.response?.data?.error || err?.message || 'Something went wrong. Please try again.';
}

export default client;
