import { useMemo } from 'react';
import { adminApi } from '../../../api';
import useLoad from '../../../hooks/useLoad';

/**
 * id -> username for staff accounts. Flags only carry the id of the admin who
 * cleared them, so the names are looked up once from the users list.
 */
export function useAdminNames() {
  const { data } = useLoad(() => adminApi.users({ role: 'admin', pageSize: 100 }), []);
  return useMemo(() => Object.fromEntries((data?.items || []).map((u) => [u.id, u.username])), [data]);
}

/**
 * accountId -> { masked, type }. A service request only carries the related
 * account's id; the masked number comes from the customers' account lists.
 * Only fetched when `enabled`.
 */
export function useAccountIndex(enabled) {
  const { data } = useLoad(() => (enabled ? adminApi.users({ role: 'customer', pageSize: 100 }) : Promise.resolve(null)), [enabled]);
  return useMemo(() => {
    const out = {};
    (data?.items || []).forEach((u) => (u.accounts || []).forEach((a) => { out[a.id] = { masked: a.accountNumberMasked, type: a.accountType }; }));
    return out;
  }, [data]);
}
