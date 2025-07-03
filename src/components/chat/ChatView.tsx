import React, { useState, useEffect } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { PinnedMessageItem } from './PinnedMessageItem';
import { useMessages } from '../../hooks/useMessages';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface ChatViewProps {
  className?: string;
}

export const ChatView: React.FC<ChatViewProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const { messages, loading, error, sendMessage, deleteMessage, editMessage, togglePin } = useMessages();
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);

  useEffect(() => {
    // Filter pinned messages
    const pinned = messages.filter(message => message.pinned);
    setPinnedMessages(pinned);
  }, [messages]);

  const handleSendMessage = async (content: string, messageType: string = 'text', audioUrl?: string, audioDuration?: number, fileUrl?: string) => {
    if (!user) return;
    
    try {
      await sendMessage({
        content,
        message_type: messageType,
        audio_url: audioUrl,
        audio_duration: audioDuration,
        file_url: fileUrl
      });
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessage(messageId);
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    try {
      await editMessage(messageId, newContent);
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleTogglePin = async (messageId: string) => {
    try {
      await togglePin(messageId);
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <div className="text-red-500 text-center">
          <p className="text-lg font-semibold mb-2">Error loading chat</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Pinned Messages
            </h3>
            <div className="space-y-2">
              {pinnedMessages.map((message) => (
                <PinnedMessageItem
                  key={message.id}
                  message={message}
                  onUnpin={() => handleTogglePin(message.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList
          messages={messages}
          onDeleteMessage={handleDeleteMessage}
          onEditMessage={handleEditMessage}
          onTogglePin={handleTogglePin}
        />
      </div>

      {/* Message Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <MessageInput onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
};