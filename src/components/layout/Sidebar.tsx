import React from 'react';
import { MessageSquare, Users, User, Settings, Plus, Moon, Sun, X } from 'lucide-react';
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
      className={`w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full fixed inset-y-0 left-0 z-40 transform transition-transform md:relative md:translate-x-0 ${
        isOpen ? '' : '-translate-x-full'
      }`}
    >
      <button
        onClick={onClose}
        className="absolute top-2 right-2 p-2 rounded-md text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 md:hidden"
        aria-label="Close sidebar"
      >
        <X className="w-4 h-4" />
      </button>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-r from-[var(--color-primary-start)] to-[var(--color-primary-end)] rounded-lg">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-gray-900 dark:text-gray-100">ChatFlow</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Realtime Messaging</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-6 py-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
              w-full flex items-center space-x-3 px-3 py-2 rounded-lg
              transition-all duration-200
              ${currentView === item.id
                ? 'bg-[var(--color-accent-light)] dark:bg-gray-700 text-[var(--color-accent)] border-l-4 border-[var(--color-accent)]'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
              }
            `}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
            {item.badge && (
              <span className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full min-w-[20px] text-center">
                {item.badge}
              </span>
            )}
          </button>
        ))}

        {/* DM List */}
        {currentView === 'dms' && (
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between px-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Conversations
              </h3>
              <button
                onClick={onNewDM}
                className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 rounded"
                aria-label="Start new conversation"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                >
                  <Avatar
                    src={conversation.other_user?.avatar_url}
                    alt={conversation.other_user?.full_name || 'User'}
                    size="sm"
                    color={conversation.other_user?.color}
                    status={conversation.other_user?.status}
                    showStatus
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {conversation.other_user?.full_name || conversation.other_user?.username}
                    </p>
                    {conversation.last_message && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {conversation.last_message.content}
                      </p>
                    )}
                  </div>
                  {conversation.unread_count > 0 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                      {conversation.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* User Profile */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <Avatar
            src={user?.avatar_url}
            alt={user?.full_name || 'You'}
            size="md"
            color={user?.color}
            status={user?.status}
            showStatus
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {user?.full_name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              @{user?.username}
            </p>
          </div>
          <button
            onClick={onToggleDarkMode}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
