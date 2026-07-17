import { Bell, Gamepad2, Images, ListChecks, MessageSquare, Users, Newspaper, Settings, Moon, Sun, X } from 'lucide-react';
import { useOptionalActivity } from '../../features/activity/ActivityContext';
import { formatActivityBadge } from '../../features/activity/activityModel';
import { ACTIVITY_FEATURE_ENABLED, CATCH_UP_FEATURE_ENABLED } from '../../config/featureFlags';
import { Avatar } from '../ui/Avatar';
import { UserRoleBadge } from '../ui/UserRoleBadge';
import { UserPresenceBadge } from '../ui/UserPresenceBadge';
import { UserAchievementBadges } from '../ui/UserAchievementBadges';
import { useAuth } from '../../hooks/useAuth';
import { useAppBadgeState } from '../../hooks/useAppBadgeState';
import { useDirectMessages } from '../../hooks/useDirectMessages';
import { getPresenceStateLabel, usePresenceForUser } from '../../hooks/usePresence';
import type { AppView } from '../../types/navigation';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isOpen: boolean;
  onClose: () => void;
  boardsEnabled?: boolean;
  boardsBadgeCount?: number;
}

export function Sidebar({
  currentView,
  onViewChange,
  isDarkMode,
  onToggleDarkMode,
  isOpen,
  onClose,
  boardsEnabled = false,
  boardsBadgeCount = 0,
}: SidebarProps) {
  const { user } = useAuth();
  const myPresence = usePresenceForUser(user?.id);
  const badgeState = useAppBadgeState();
  const { conversations } = useDirectMessages();
  const activity = useOptionalActivity();
  const myPresenceState =
    myPresence?.presence_state ||
    (user?.presence_visibility === 'invisible' ? 'invisible' : 'offline');

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
  const catchUpUnread = badgeState.interactions + badgeState.connections;

  const navItems = [
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageSquare,
      badge: badgeState.group || null,
    },
    {
      id: 'dms' as const,
      label: 'Direct Messages',
      icon: Users,
      badge: Math.max(totalUnread, badgeState.dm) || null,
    },
    ...(CATCH_UP_FEATURE_ENABLED ? [{
      id: 'catchup' as const,
      label: 'Catch-Up',
      icon: ListChecks,
      badge: catchUpUnread || null,
    }] : []),
    ...(ACTIVITY_FEATURE_ENABLED ? [{
      id: 'activity' as const,
      label: 'Activity',
      icon: Bell,
      badge: activity?.unreadCount ? activity.unreadCount : null,
    }] : []),
    ...(boardsEnabled ? [{
      id: 'boards' as const,
      label: 'Boards',
      icon: Newspaper,
      badge: boardsBadgeCount > 0 ? boardsBadgeCount : null,
    }] : []),
    {
      id: 'games' as const,
      label: 'Entertainment',
      icon: Gamepad2,
      badge: badgeState.games || null,
    },
    {
      id: 'pins' as const,
      label: 'Pins',
      icon: Images,
      badge: badgeState.shadow_pin || null,
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <div
      className={`glass-panel-strong fixed inset-y-0 left-0 z-40 flex h-full w-64 transform flex-col border-r border-[var(--border-panel)] transition-transform md:relative md:translate-x-0 ${
        isOpen ? '' : '-translate-x-full'
      }`}
    >
      <button
        onClick={onClose}
        className="absolute right-2 top-2 rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)] md:hidden"
        aria-label="Close sidebar"
      >
        <X className="w-4 h-4" />
      </button>
      {/* Header */}
      <div className="flex h-20 items-center overflow-visible border-b border-[var(--border-panel)] px-5">
        <div className="flex w-full items-center gap-3">
          <img
            src="/icons/header-logo-safe.png"
            alt="SHADO"
            className="h-12 w-12 shrink-0 rounded-[var(--radius-md)] object-contain shadow-[0_10px_24px_rgba(0,0,0,0.28)]"
          />
          <span className="text-lg font-semibold tracking-[0.26em] text-[var(--text-primary)]">SHADO</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            aria-label={`${item.label}${item.badge ? `, ${item.badge} unread` : ''}`}
            aria-current={currentView === item.id ? 'page' : undefined}
            className={`
              flex w-full items-center space-x-3 rounded-[var(--radius-md)] px-3 py-3
              border transition-[background-color,border-color,box-shadow,color] duration-[var(--dur-med)]
              ${currentView === item.id
                ? 'theme-selected-row text-[var(--theme-accent-readable)]'
                : 'border-transparent text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            <span className={`rounded-[var(--radius-sm)] p-2 ${currentView === item.id ? 'bg-[var(--theme-accent-soft)]' : 'bg-[rgba(255,255,255,0.03)]'}`}>
              <item.icon className="h-4 w-4" />
            </span>
            <span className="font-medium">{item.label}</span>
            {item.badge && (
              <span aria-hidden="true" className="theme-unread-badge ml-auto min-w-[20px] rounded-full px-2 py-1 text-center text-xs">
                {formatActivityBadge(item.badge)}
              </span>
            )}
          </button>
        ))}

        {/* DM List intentionally omitted as the Direct Messages view includes its own sidebar */}
      </nav>

      {/* User Profile */}
      <div className="border-t border-[var(--border-panel)] px-4 py-4">
        <div className="glass-panel rounded-[var(--radius-lg)] px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Signed in</span>
            <button
              onClick={onToggleDarkMode}
              className="rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--theme-surface-hover)] hover:text-[var(--theme-accent-readable)]"
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="flex items-center space-x-3">
            <Avatar
              src={user?.avatar_thumbnail_url || user?.avatar_url}
              alt={user?.display_name || 'You'}
              size="md"
              color={user?.color}
              userId={user?.id}
              presenceVisibility={user?.presence_visibility}
              showStatus
            />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
                <span className="truncate">{user?.display_name}</span>
                <UserRoleBadge role={user?.admin_role} />
                <UserAchievementBadges user={user} />
                <UserPresenceBadge userId={user?.id} presenceVisibility={user?.presence_visibility} />
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                @{user?.username}
              </p>
              <p className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {getPresenceStateLabel(myPresenceState)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
