import React from 'react';
import { MessageSquare, Users, User, Settings, Moon, Sun, X } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../hooks/useAuth';
import { useDirectMessages } from '../../hooks/useDirectMessages';

interface SidebarProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings';
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onNewDM?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({
  currentView,
  onViewChange,
  isDarkMode,
  onToggleDarkMode,
  onNewDM,
  isOpen,
  onClose,
}: SidebarProps) {
  const { user } = useAuth();
  const { conversations } = useDirectMessages();

  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);

  const navItems = [
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageSquare,
      badge: null,
    },
    {
      id: 'dms' as const,
      label: 'Direct Messages',
      icon: Users,
      badge: totalUnread > 0 ? totalUnread : null,
    },
    {
      id: 'profile' as const,
      label: 'Profile',
      icon: User,
      badge: null,
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
      <div className="border-b border-[var(--border-panel)] px-5 py-5">
        <div className="flex flex-col gap-2">
          <img
            src="/icons/header-logo.png"
            alt="SHADO"
            className="h-20 w-full object-contain object-left"
          />
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">Private Console</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-2 px-4 py-5">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
              flex w-full items-center space-x-3 rounded-[var(--radius-md)] px-3 py-3
              border transition-all duration-[var(--dur-med)]
              ${currentView === item.id
                ? 'border-[var(--border-glow)] bg-[rgba(255,255,255,0.05)] text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)]'
                : 'border-transparent text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text-primary)]'
              }
            `}
          >
            <span className={`rounded-[var(--radius-sm)] p-2 ${currentView === item.id ? 'bg-[rgba(215,170,70,0.12)]' : 'bg-[rgba(255,255,255,0.03)]'}`}>
              <item.icon className="h-4 w-4" />
            </span>
            <span className="font-medium">{item.label}</span>
            {item.badge && (
              <span className="ml-auto min-w-[20px] rounded-full border border-[rgba(215,170,70,0.3)] bg-[rgba(215,170,70,0.14)] px-2 py-1 text-center text-xs text-[var(--text-gold)]">
                {item.badge}
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
              className="rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-gold)]"
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
              src={user?.avatar_url}
              alt={user?.display_name || 'You'}
              size="md"
              color={user?.color}
              status={user?.status}
              showStatus
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {user?.display_name}
              </p>
              <p className="truncate text-xs text-[var(--text-muted)]">
                @{user?.username}
              </p>
              <p className="mt-1 truncate text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {user?.status || 'offline'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
