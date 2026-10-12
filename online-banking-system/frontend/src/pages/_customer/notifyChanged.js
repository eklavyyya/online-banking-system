import { NOTIFICATIONS_CHANGED } from '../../components/Layout';

/** Tells the sidebar badge to re-read the unread count. */
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}
