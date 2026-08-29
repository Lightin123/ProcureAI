import React from "react";
import { useNavigate } from "react-router-dom";

import {
  fetchNotificationSummary,
  markNotificationRead,
  markNotificationsRead,
  type VendorNotification,
} from "../api/vendor.js";
import { BellIcon } from "./GovernmentIcons.js";

/**
 * The supplier portal's notification entry point.
 *
 * Sits in the institutional header, so an invitation reaches the supplier on
 * whichever page they happen to be on rather than only on the dashboard. The
 * count is the number of unread notifications; opening one marks that one read
 * and navigates to what it is about — for an invitation, the invitation itself.
 *
 * Rendered only for accounts that hold the supplier permission. It is not a
 * government control, and the endpoints behind it resolve the supplier profile
 * from the session, so it has nothing to show a government official even if it
 * were rendered for one.
 */

function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState<VendorNotification[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const summary = await fetchNotificationSummary(signal);
      setUnreadCount(summary.unreadCount);
      setNotifications(summary.notifications);
      setLoaded(true);
    } catch {
      // A header badge is not worth an error banner. The dashboard and the
      // invitations page both surface the same data and do report failures.
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
    };
  }, [load]);

  // Closing on an outside click rather than on blur: the panel contains buttons,
  // and blur would close it before the click that caused the blur landed.
  React.useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node) !== true) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function openPanel(): Promise<void> {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }

  async function openNotification(notification: VendorNotification): Promise<void> {
    setOpen(false);

    if (notification.readAt === null) {
      try {
        const result = await markNotificationRead(notification.id);
        setUnreadCount(result.unreadCount);
      } catch {
        // Navigation still happens: failing to record that a notification was
        // read must not stop the supplier reaching the invitation.
      }
    }

    const target =
      notification.linkPath ??
      (notification.invitationId === null
        ? null
        : `/vendor/invitations/${notification.invitationId}`);

    if (target !== null) await navigate(target);
  }

  async function markAll(): Promise<void> {
    try {
      await markNotificationsRead();
    } finally {
      await load();
    }
  }

  return (
    <div className="gov-bell" ref={containerRef}>
      <button
        type="button"
        className="gov-bell__button"
        onClick={() => void openPanel()}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={
          unreadCount === 0
            ? "Notifications"
            : `Notifications, ${unreadCount} unread`
        }
      >
        <BellIcon size={18} />
        {unreadCount > 0 && (
          <span className="gov-bell__count" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="gov-bell__panel" role="region" aria-label="Notifications">
          <div className="gov-bell__panel-head">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" className="gov-link-button" onClick={() => void markAll()}>
                Mark all read
              </button>
            )}
          </div>

          {!loaded ? (
            <p className="gov-bell__empty">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="gov-bell__empty">You have no notifications.</p>
          ) : (
            <ul className="gov-bell__list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    className={`gov-bell__item${
                      notification.readAt === null ? " gov-bell__item--unread" : ""
                    }`}
                    onClick={() => void openNotification(notification)}
                  >
                    <span className="gov-bell__item-head">
                      <strong>{notification.title}</strong>
                      <span>{relativeTime(notification.createdAt)}</span>
                    </span>
                    <span className="gov-bell__item-body">{notification.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="gov-bell__panel-foot">
            <button
              type="button"
              className="gov-link-button"
              onClick={() => {
                setOpen(false);
                void navigate("/vendor/invitations");
              }}
            >
              View procurement invitations
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
