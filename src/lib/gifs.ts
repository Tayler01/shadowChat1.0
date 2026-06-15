import { ensureSession, getWorkingClient } from './supabase'

export type GifResult = {
  id: string
  title: string
  url: string
  previewUrl: string
  width?: number
  height?: number
  sourceUrl?: string
}

export type GifSearchResponse = {
  gifs: GifResult[]
  nextPage?: number | null
}

type GifSearchOptions = {
  query?: string
  page?: number
  limit?: number
  signal?: AbortSignal
}

export const searchKlipyGifs = async ({
  query = '',
  page = 1,
  limit = 24,
  signal,
}: GifSearchOptions = {}): Promise<GifSearchResponse> => {
  const sessionValid = await ensureSession()
  if (!sessionValid) {
    throw new Error('Sign in to search GIFs')
  }

  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.functions.invoke('klipy-gifs', {
    body: {
      query: query.trim(),
      page,
      limit,
    },
    signal,
  }) as { data?: GifSearchResponse; error?: { message?: string } | null }

  if (error) {
    throw new Error(error.message || 'Unable to load GIFs')
  }

  return {
    gifs: Array.isArray(data?.gifs) ? data.gifs : [],
    nextPage: data?.nextPage ?? null,
  }
}
