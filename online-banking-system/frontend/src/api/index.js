import client from './client';

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Axios cannot parse an error body when responseType is 'blob'; this reads it back.
export async function blobErrorMessage(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()).error || 'Download failed.'; } catch { return 'Download failed.'; }
  }
  return err?.response?.data?.error || err?.message || 'Download failed.';
}

export const authApi = {
  login: (username, password) => client.post('/auth/login', { username, password }).then((r) => r.data),
  verifyOtp: (username, otp) => client.post('/auth/verify-otp', { username, otp }).then((r) => r.data),
  forgotPassword: (username) => client.post('/auth/forgot-password', { username }).then((r) => r.data),
  resetPassword: (username, otp, newPassword) =>
    client.post('/auth/reset-password', { username, otp, newPassword }).then((r) => r.data),
  logout: () => client.post('/auth/logout').then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
  setMpin: (mpin) => client.post('/auth/mpin', { mpin }).then((r) => r.data),
};

export const accountsApi = {
  list: () => client.get('/accounts').then((r) => r.data.accounts),
  get: (id) => client.get(`/accounts/${id}`).then((r) => r.data.account),
  transactions: (id, params) => client.get(`/accounts/${id}/transactions`, { params }).then((r) => r.data.transactions),
  // The statement needs the Authorization header, so it is fetched as a blob
  // and saved through a temporary link rather than opened with window.open.
  downloadStatement: async (id, { from, to, format = 'csv' } = {}) => {
    const params = { format };
    if (from) params.from = from;
    if (to) params.to = to;
    const res = await client.get(`/accounts/${id}/statement`, { params, responseType: 'blob' });
    saveBlob(res.data, `statement-account-${id}.${format}`);
  },
};

export const profileApi = {
  get: () => client.get('/profile').then((r) => r.data),
  update: (updates) => client.put('/profile', updates).then((r) => r.data),
};

export const beneficiaryApi = {
  list: () => client.get('/beneficiaries').then((r) => r.data.beneficiaries),
  add: (data) => client.post('/beneficiaries', data).then((r) => r.data.beneficiary),
  update: (id, data) => client.put(`/beneficiaries/${id}`, data).then((r) => r.data.beneficiary),
  remove: (id) => client.delete(`/beneficiaries/${id}`).then((r) => r.data),
};

export const transferApi = {
  initiate: (data) => client.post('/transfers/initiate', data).then((r) => r.data),
  confirm: (transactionId, mpin) => client.post('/transfers/confirm', { transactionId, mpin }).then((r) => r.data),
  get: (id) => client.get(`/transfers/${id}`).then((r) => r.data.transaction),
};

export const billerApi = {
  list: () => client.get('/bills/billers').then((r) => r.data.billers),
  add: (data) => client.post('/bills/billers', data).then((r) => r.data.biller),
  remove: (id) => client.delete(`/bills/billers/${id}`).then((r) => r.data),
};

export const billPayApi = {
  initiate: (data) => client.post('/bills/pay/initiate', data).then((r) => r.data),
  confirm: (transactionId, mpin) => client.post('/bills/pay/confirm', { transactionId, mpin }).then((r) => r.data),
  history: (params) => client.get('/bills/pay/history', { params }).then((r) => r.data.transactions),
};

export const depositApi = {
  list: () => client.get('/deposits').then((r) => r.data.deposits),
  get: (id) => client.get(`/deposits/${id}`).then((r) => r.data.deposit),
  open: (data) => client.post('/deposits', data).then((r) => r.data.deposit), // data includes mpin
  closePrematurely: (id, mpin) => client.post(`/deposits/${id}/close`, { mpin }).then((r) => r.data),
};

// ---------------------------------------------------------------- Phase 2
const clean = (params) => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v !== undefined && v !== null));
const get = (url, params) => client.get(url, { params: clean(params) }).then((r) => r.data);

export const loanApi = {
  offers: () => get('/loans/offers'),                                          // { totalBalance, products: [...] }
  calculate: (data) => client.post('/loans/calculate', data).then((r) => r.data), // { emi, totalInterest, totalPayable, schedule }
  list: () => get('/loans'),                                                   // { loans: [...] }
  get: (id) => get(`/loans/${id}`),                                            // { loan, schedule }
  apply: (data) => client.post('/loans', data).then((r) => r.data),            // { loan }
  payEmi: (id, mpin) => client.post(`/loans/${id}/pay-emi`, { mpin }).then((r) => r.data),
};

export const cardApi = {
  list: () => get('/cards').then((d) => d.cards),
  block: (id) => client.post(`/cards/${id}/block`).then((r) => r.data),
  requestUnblock: (id, reason) => client.post(`/cards/${id}/request-unblock`, { reason }).then((r) => r.data),
  updateLimits: (id, limits) => client.put(`/cards/${id}/limits`, limits).then((r) => r.data),
  updateChannels: (id, channels) => client.put(`/cards/${id}/channels`, channels).then((r) => r.data),
};

export const serviceRequestApi = {
  list: (params) => get('/service-requests', params).then((d) => d.serviceRequests),
  get: (id) => get(`/service-requests/${id}`).then((d) => d.serviceRequest),
  create: (data) => client.post('/service-requests', data).then((r) => r.data.serviceRequest),
  close: (id) => client.post(`/service-requests/${id}/close`).then((r) => r.data.serviceRequest),
};

export const notificationApi = {
  list: (params) => get('/notifications', params),                // { items, total, page, pageSize, totalPages, unreadCount }
  unreadCount: () => get('/notifications/unread-count').then((d) => d.unreadCount),
  markRead: (id) => client.post(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => client.post('/notifications/read-all').then((r) => r.data),
  getPreferences: () => get('/notifications/preferences').then((d) => d.preferences),
  updatePreferences: (data) => client.put('/notifications/preferences', data).then((r) => r.data.preferences),
};

export const adminApi = {
  overview: () => get('/admin/overview'),
  users: (params) => get('/admin/users', params),                                // paged
  user: (id) => get(`/admin/users/${id}`).then((d) => d.user),
  createUser: (data) => client.post('/admin/users', data).then((r) => r.data.user),
  updateUser: (id, data) => client.put(`/admin/users/${id}`, data).then((r) => r.data.user),
  deactivateUser: (id) => client.post(`/admin/users/${id}/deactivate`).then((r) => r.data.user),
  activateUser: (id) => client.post(`/admin/users/${id}/activate`).then((r) => r.data.user),
  unlockUser: (id) => client.post(`/admin/users/${id}/unlock`).then((r) => r.data.user),

  transactions: (params) => get('/admin/transactions', params),                  // paged + summary
  flags: (params) => get('/admin/flags', params),                                // paged
  createFlag: (data) => client.post('/admin/flags', data).then((r) => r.data.flag),
  clearFlag: (id, note) => client.post(`/admin/flags/${id}/clear`, { note }).then((r) => r.data.flag),

  loans: (params) => get('/admin/loans', params),                                // paged
  approveLoan: (id) => client.post(`/admin/loans/${id}/approve`).then((r) => r.data.loan),
  rejectLoan: (id, reason) => client.post(`/admin/loans/${id}/reject`, { reason }).then((r) => r.data.loan),

  serviceRequests: (params) => get('/admin/service-requests', params),           // paged
  serviceRequest: (id) => get(`/admin/service-requests/${id}`).then((d) => d.serviceRequest),
  updateServiceRequest: (id, data) => client.put(`/admin/service-requests/${id}`, data).then((r) => r.data.serviceRequest),

  summaryReport: (params) => get('/admin/reports/summary', params),
  activityLog: (params) => get('/admin/activity-log', params),                   // paged
  broadcast: (data) => client.post('/admin/notifications/broadcast', data).then((r) => r.data),
};
