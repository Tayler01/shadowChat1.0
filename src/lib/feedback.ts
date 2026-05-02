import { getWorkingClient, type User } from './supabase'

export const FEEDBACK_ATTACHMENTS_BUCKET = 'feedback-attachments'
export const MAX_FEEDBACK_ATTACHMENTS = 5
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const FEEDBACK_ATTACHMENT_SIGNED_URL_SECONDS = 30 * 60

export type FeedbackSubmissionType = 'bug' | 'feature'
export type FeedbackSubmissionStatus = 'new' | 'reviewing' | 'planned' | 'closed'

export interface FeedbackAttachmentRecord {
  bucket: typeof FEEDBACK_ATTACHMENTS_BUCKET
  path: string
  name: string
  size: number
  type: string
}

export interface FeedbackSubmissionInput {
  type: FeedbackSubmissionType
  title: string
  description: string
  attachments?: File[]
}

export interface FeedbackSubmissionResult {
  id: string
  attachments: FeedbackAttachmentRecord[]
}

export interface AdminFeedbackAttachmentRecord extends FeedbackAttachmentRecord {
  signedUrl?: string
  signedUrlError?: string
}

export type FeedbackSubmitter = Pick<
  User,
  | 'id'
  | 'username'
  | 'display_name'
  | 'avatar_url'
  | 'color'
  | 'status'
  | 'admin_role'
  | 'presence_visibility'
>

export interface AdminFeedbackSubmission {
  id: string
  user_id: string
  submission_type: FeedbackSubmissionType
  title: string
  description: string
  attachments: AdminFeedbackAttachmentRecord[]
  status: FeedbackSubmissionStatus
  user_agent?: string | null
  created_at: string
  updated_at: string
  user?: FeedbackSubmitter | null
}

type FeedbackSubmissionRow = Omit<AdminFeedbackSubmission, 'attachments' | 'user'> & {
  attachments: unknown
}

const titleMinLength = 3
const titleMaxLength = 140
const descriptionMinLength = 10
const descriptionMaxLength = 4000

const isImageFile = (file: File) => file.type.startsWith('image/')

const getRandomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (character) => {
    const randomValue = Math.floor(Math.random() * 256)
    return (Number(character) ^ (randomValue & (15 >> (Number(character) / 4)))).toString(16)
  })
}

const sanitizeFileName = (name: string) => {
  const withoutPath = name.split(/[\\/]/).pop() || 'attachment'
  const safeName = withoutPath
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80)

  return safeName || 'attachment'
}

const isFeedbackAttachmentRecord = (value: unknown): value is FeedbackAttachmentRecord => {
  if (!value || typeof value !== 'object') return false

  const attachment = value as Partial<FeedbackAttachmentRecord>
  return (
    attachment.bucket === FEEDBACK_ATTACHMENTS_BUCKET &&
    typeof attachment.path === 'string' &&
    attachment.path.length > 0 &&
    typeof attachment.name === 'string' &&
    typeof attachment.size === 'number' &&
    typeof attachment.type === 'string'
  )
}

const normalizeFeedbackAttachments = (attachments: unknown): FeedbackAttachmentRecord[] => {
  if (!Array.isArray(attachments)) return []

  return attachments.filter(isFeedbackAttachmentRecord)
}

const signFeedbackAttachments = async (
  workingClient: Awaited<ReturnType<typeof getWorkingClient>>,
  attachments: FeedbackAttachmentRecord[]
): Promise<AdminFeedbackAttachmentRecord[]> => {
  if (attachments.length === 0) return []

  const paths = attachments.map(attachment => attachment.path)
  const signedUrlResult = await workingClient.storage
    .from(FEEDBACK_ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, FEEDBACK_ATTACHMENT_SIGNED_URL_SECONDS)

  if (signedUrlResult.error) {
    return attachments.map(attachment => ({
      ...attachment,
      signedUrlError: signedUrlResult.error.message,
    }))
  }

  const signedUrlsByPath = new Map<string, string>()
  ;(signedUrlResult.data ?? []).forEach((signedUrlRecord: any) => {
    const path = signedUrlRecord.path || signedUrlRecord.name
    const signedUrl = signedUrlRecord.signedUrl || signedUrlRecord.signedURL
    if (path && signedUrl) {
      signedUrlsByPath.set(path, signedUrl)
    }
  })

  return attachments.map(attachment => ({
    ...attachment,
    signedUrl: signedUrlsByPath.get(attachment.path),
  }))
}

export const fetchAdminFeedbackSubmissions = async (): Promise<AdminFeedbackSubmission[]> => {
  const workingClient = await getWorkingClient()
  const { data: feedbackRows, error: feedbackError } = await workingClient
    .from('feedback_submissions')
    .select('id, user_id, submission_type, title, description, attachments, status, user_agent, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (feedbackError) {
    throw feedbackError
  }

  const rows = (feedbackRows ?? []) as FeedbackSubmissionRow[]
  const submitterIds = Array.from(new Set(rows.map(row => row.user_id).filter(Boolean)))
  const submittersById = new Map<string, FeedbackSubmitter>()

  if (submitterIds.length > 0) {
    const { data: submitters, error: submittersError } = await workingClient
      .from('users')
      .select('id, username, display_name, avatar_url, color, status, admin_role, presence_visibility')
      .in('id', submitterIds)

    if (submittersError) {
      throw submittersError
    }

    ;((submitters ?? []) as FeedbackSubmitter[]).forEach(submitter => {
      submittersById.set(submitter.id, submitter)
    })
  }

  return Promise.all(rows.map(async row => ({
    ...row,
    attachments: await signFeedbackAttachments(
      workingClient,
      normalizeFeedbackAttachments(row.attachments)
    ),
    user: submittersById.get(row.user_id) ?? null,
  })))
}

export const buildFeedbackAttachmentPath = (
  userId: string,
  submissionId: string,
  file: File,
  index: number
) => {
  return `${userId}/${submissionId}/${index + 1}-${getRandomId()}-${sanitizeFileName(file.name)}`
}

export const validateFeedbackSubmission = (input: FeedbackSubmissionInput) => {
  const title = input.title.trim()
  const description = input.description.trim()
  const attachments = input.attachments ?? []

  if (input.type !== 'bug' && input.type !== 'feature') {
    throw new Error('Choose bug report or feature idea')
  }

  if (title.length < titleMinLength) {
    throw new Error('Add a short title')
  }

  if (title.length > titleMaxLength) {
    throw new Error(`Keep the title under ${titleMaxLength} characters`)
  }

  if (description.length < descriptionMinLength) {
    throw new Error('Add a little more detail')
  }

  if (description.length > descriptionMaxLength) {
    throw new Error(`Keep the description under ${descriptionMaxLength} characters`)
  }

  if (attachments.length > MAX_FEEDBACK_ATTACHMENTS) {
    throw new Error(`Attach up to ${MAX_FEEDBACK_ATTACHMENTS} images`)
  }

  attachments.forEach((file) => {
    if (!isImageFile(file)) {
      throw new Error('Attachments must be images')
    }

    if (file.size > MAX_FEEDBACK_ATTACHMENT_BYTES) {
      throw new Error('Each image must be 10 MB or smaller')
    }
  })

  return {
    type: input.type,
    title,
    description,
    attachments,
  }
}

export const submitFeedback = async (
  input: FeedbackSubmissionInput
): Promise<FeedbackSubmissionResult> => {
  const normalized = validateFeedbackSubmission(input)
  const workingClient = await getWorkingClient()
  const { data: { user }, error: userError } = await workingClient.auth.getUser()

  if (userError) {
    throw userError
  }

  if (!user) {
    throw new Error('Sign in before sending feedback')
  }

  const submissionId = getRandomId()
  const uploadedAttachments: FeedbackAttachmentRecord[] = []

  try {
    for (const [index, file] of normalized.attachments.entries()) {
      const path = buildFeedbackAttachmentPath(user.id, submissionId, file, index)
      const { error } = await workingClient.storage
        .from(FEEDBACK_ATTACHMENTS_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        })

      if (error) {
        throw error
      }

      uploadedAttachments.push({
        bucket: FEEDBACK_ATTACHMENTS_BUCKET,
        path,
        name: file.name,
        size: file.size,
        type: file.type,
      })
    }

    const { data, error } = await workingClient
      .from('feedback_submissions')
      .insert({
        id: submissionId,
        user_id: user.id,
        submission_type: normalized.type,
        title: normalized.title,
        description: normalized.description,
        attachments: uploadedAttachments,
        user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
      })
      .select('id')
      .single()

    if (error) {
      throw error
    }

    return {
      id: data?.id ?? submissionId,
      attachments: uploadedAttachments,
    }
  } catch (error) {
    if (uploadedAttachments.length > 0) {
      try {
        await workingClient.storage
          .from(FEEDBACK_ATTACHMENTS_BUCKET)
          .remove(uploadedAttachments.map((attachment) => attachment.path))
      } catch {
        // Best-effort cleanup only; private per-user paths are still safe.
      }
    }

    throw error
  }
}
