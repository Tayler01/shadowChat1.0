import { getWorkingClient } from './supabase'

export const FEEDBACK_ATTACHMENTS_BUCKET = 'feedback-attachments'
export const MAX_FEEDBACK_ATTACHMENTS = 5
export const MAX_FEEDBACK_ATTACHMENT_BYTES = 10 * 1024 * 1024

export type FeedbackSubmissionType = 'bug' | 'feature'

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
