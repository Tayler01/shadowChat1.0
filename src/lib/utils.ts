import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ChatMessage } from './supabase'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(date: string | Date) {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) {
    return 'Today'
  } else if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday'
  } else {
    return d.toLocaleDateString([], { 
      month: 'short', 
      day: 'numeric',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }
}

export function isToday(date: string | Date) {
  const d = new Date(date)
  const today = new Date()
  return d.toDateString() === today.toDateString()
}

export function groupMessagesByDate(messages: ChatMessage[]) {
  const groups: { date: string; messages: ChatMessage[] }[] = []
  let currentDate = ''
  let currentGroup: ChatMessage[] = []

  messages.forEach(message => {
    const messageDate = formatDate(message.created_at)
    
    if (messageDate !== currentDate) {
      if (currentGroup.length > 0) {
        groups.push({ date: currentDate, messages: currentGroup })
      }
      currentDate = messageDate
      currentGroup = [message]
    } else {
      currentGroup.push(message)
    }
  })

  if (currentGroup.length > 0) {
    groups.push({ date: currentDate, messages: currentGroup })
  }

  return groups
}

export function shouldGroupMessage(current: ChatMessage, previous?: ChatMessage) {
  if (!previous) return false

  // Determine ids for chat or DM messages
  const currentId = (current as any).user_id ?? (current as any).sender_id
  const previousId = (previous as any).user_id ?? (previous as any).sender_id

  // Only group messages if they are from the same sender and sent within a
  // short time window (default: 5 minutes)
  if (currentId !== previousId) return false

  const currentTime = new Date(current.created_at).getTime()
  const previousTime = new Date(previous.created_at).getTime()
  const FIVE_MINUTES = 5 * 60 * 1000

  return Math.abs(currentTime - previousTime) < FIVE_MINUTES
}

// Slash command processor
export interface SlashCommand {
  command: string
  description: string
  handler: (args: string) => string
}

export const slashCommands: SlashCommand[] = [
  {
    command: '/shrug',
    description: 'Send a shrug emoticon',
    handler: () => '¯\\_(ツ)_/¯'
  },
  {
    command: '/me',
    description: 'Send an action message',
    handler: (args: string) => `*${args}*`
  },
  {
    command: '/giphy',
    description: 'Search for a GIF',
    handler: (args: string) => `🎬 *Searching for "${args}" GIF...*`
  }
]

export function processSlashCommand(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null

  const [command, ...argsParts] = trimmed.split(' ')
  const args = argsParts.join(' ')

  const slashCommand = slashCommands.find(cmd => cmd.command === command)
  if (!slashCommand) return null

  return slashCommand.handler(args)
}

