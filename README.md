# 🧠 Realtime Chat Platform — React + Supabase + TypeScript ## Overview
This project is a full-featured, production-ready realtime messaging application built with React, TypeScript, and Supabase. It provides a modern, extensible foundation for both public group chat and private direct messaging (DMs), wrapped in a highly polished user interface. Designed to be responsive, modular, and fast, this app is suitable for team collaboration, social networking, gaming communities, or custom internal messaging tools.

The app combines Supabase’s backend power (PostgreSQL, Realtime, Auth, Storage, Edge Functions) with a finely-tuned React frontend using TailwindCSS, Framer Motion, and component-level hooks to manage presence, message flow, and UI transitions.

--- ## Key Features ### Realtime Group Chat
Streamed messages with automatic updates via Supabase Realtime channels
Grouped message bubbles with optimized UI (shows avatar only on first message in a burst)
Editable and deletable messages, secured with row-level security (RLS)
Pinned messages for announcements or important information
Emoji reactions, toggled with live updates
Slash command system (/shrug, /me, /giphy, /summary) with a pluggable command registry
Typing indicators displayed in real-time using broadcast channels
Sticky date headers that remain visible while scrolling
"Jump to Latest" button appears when new messages arrive and you're not at the bottom
### Direct Messaging (DMs)
1-on-1 private chats using dedicated DM tables and RLS policies
Unread tracking with live badge updates and local fallback
Toast preview notifications for new incoming messages (if not viewing that thread)
Search and initiate new conversations via username
Double-tap a user in search to start a new conversation if one doesn't already exist
Live presence updates in DMs (online/away indicators)
Message read status stored with read_at timestamps per message
### User Presence System
Presence is tracked using the update_user_last_active() RPC and Supabase triggers.
The system listens to users table updates and visually reflects active/inactive status.
Presence pings occur at a configurable interval (default 30s), with the value VITE_PRESENCE_INTERVAL_MS.
### User Profiles
Users can view and edit their display name, handle, status message, and custom chat color.
Avatars and banner images are uploaded via Supabase Storage and updated in real-time.
Presence status options: Online, AFK, Busy, Offline.
Profiles are visible in messages, hover cards, and dedicated profile pages.
### Notifications
Incoming direct messages trigger popup toasts if the user is not on that thread.
A global badge indicator on the sidebar highlights unread conversations.
Read tracking is done via Supabase and synced using the useDMNotifications hook.
### Message Reactions
Emoji reactions can be toggled on any message.
Stored in a reactions object on the message record.
Reaction logic is managed via a toggle_message_reaction() Supabase function.
### Slash Commands
Slash commands are typed into the message input and processed client-side.
Commands include:
/shrug → ¯\_(ツ)_/¯
/giphy <term> → Shows a random gif (mock or via real integration)
/me → Emotes as the current user
Additional commands can be added dynamically with handler functions.
--- ## Supabase Schema ### Tables
users: id, name, avatar_url, banner_url, last_active, status, color
messages: id, user_id, content, inserted_at, reactions, pinned
dm_conversations: id, participants[], last_message_at
dm_messages: id, conversation_id, sender_id, content, read_at
### Functions

CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS void AS $$
BEGIN
  UPDATE users SET last_active = now() WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_user_last_active() TO authenticated;
toggle_message_reaction(message_id, emoji) — toggles reactions per user
### Row-Level Security (RLS)
Messages can only be read/modified by the sender
DMs can only be accessed by participants
User profiles can only be modified by the owner
### Triggers
A trigger on dm_messages updates the last_message_at timestamp on the corresponding conversation
--- ## Advanced UI / UX Features ### Navigation
Persistent sidebar navigation with icons for Chat, DMs, Profile, and Settings
Collapsible on mobile and tablet
Menu buttons in each view header toggle the sidebar on small screens
Sidebar shows unread message badges and typing indicators
### Dark Mode
Theme toggle available in settings
Stored in localStorage to persist across sessions
Signing out clears cached chat history and failed message queues
### Typing Indicators
When a user types, a typing event is broadcast to the channel
Other users in that room see "User is typing..."
### Emoji Picker
Message input supports emoji selection with a visual emoji picker
Reactions also use this picker
### Sticky Headers
Date dividers and typing status bars remain sticky while scrolling chat
### Mobile Responsiveness
Fully responsive layout
Swipeable interactions for switching tabs and triggering modals
Mobile-first optimizations on message input and layout
--- ## Media & Uploads
Users can upload avatars, banners, and files via drag-and-drop or file picker
Upload progress is shown via animated loaders
Supported formats:
Images (JPG, PNG, WebP, GIF)
Documents (PDF, TXT)
Audio messages (OGG, MP3)
Uploads stored in Supabase Storage and linked via signed URLs
--- ## Global Search
Global message search by keyword
Filters:
By user
By date range
By conversation
Message results are highlighted and jump-to enabled
--- ## AI-Ready Features
Thread summarization using OpenAI GPT
Tone analysis detects emotional content using sentiment analysis
AI replies and auto-suggested responses
Moderation engine to flag offensive or inappropriate content
Smart mentions or entity linking to user profiles, topics, or commands
--- ## Security & Moderation
Per-user RLS security enforced at database level
Admins and moderators have elevated read/write access
Ability to:
Block or mute users
Delete or edit flagged content
View moderation logs
(Planned) GPT moderation pipeline to detect spam, hate speech, etc.
--- ## Environment Configuration

VITE_SUPABASE_URL=<your Supabase project URL>
VITE_SUPABASE_ANON_KEY=<your Supabase anon key>
VITE_PRESENCE_INTERVAL_MS=30000 # optional
VITE_OPENAI_KEY=<your OpenAI API key> # for /summary and tone analysis
--- ## Getting Started

# Clone the repo
git clone https://github.com/Tayler01/shadowChat1.0.git
cd shadowChat1.0

# Install dependencies
npm install
# This pulls in the `sentiment` package used for tone analysis

# Lint the code
npm run lint

# Run tests
npm test

# Apply Supabase migrations
npx supabase db push

# This will also create the `avatars`, `banners`, `message-media`, and `chat-uploads` storage buckets
# along with the row-level security policies needed for uploads.
# Run the same command in production to ensure the bucket exists

# Start the dev server
npm run dev
--- ## Testing & CI/CD ### Testing Stack
Jest for unit tests
React Testing Library for DOM interaction
Coverage includes:
Message posting
Reaction toggles
Auth flow
Presence pings
Profile updates
### Continuous Integration
GitHub Actions pipeline:
Run lint, type-check, and test on pull request
Deploy to Netlify or Vercel on merge to main
Optional: Slack/Discord webhook alerts

--- ## Troubleshooting Realtime Connections

If realtime channels stop updating after a manual session refresh, call the `resetRealtimeConnection` helper to re-authenticate the websocket:

```ts
import { resetRealtimeConnection } from './src/lib/supabase'

await resetRealtimeConnection()
```

This disconnects the realtime client, reconnects it and sets the auth token
from the current session.

Fresh clients store auth tokens under keys prefixed with
`sb-${projectRef}-auth-token-fresh-<unique-id>` where the unique id is
generated via `crypto.randomUUID()` when available. The library automatically
purges old keys whenever a new fresh client is created or promoted so stale
entries do not linger in `localStorage`.

--- ## Future Features
Push notifications (web + mobile)
Offline drafts and local caching (message history cached on load)
Threaded replies and collapsible chains
Video or voice rooms using WebRTC
Third-party plugin support
Federation or multi-tenant support
--- ## Final Summary
This project is a complete, secure, customizable real-time messaging platform with deep integration of Supabase services. It emphasizes rich interaction, clean UX, and modern engineering practices. Designed to be deployable from scratch or expanded into a full product, it can power both niche internal tools and production-grade social chat networks.

Built by developers for developers — with customization, scaling, and polish in mind.
