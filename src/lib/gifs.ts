import { invokeAuthenticatedEdgeFunction } from './edgeFunctions'

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
  const data = await invokeAuthenticatedEdgeFunction<GifSearchResponse>('klipy-gifs', {
      query: query.trim(),
      page,
      limit,
  }, { signal })

  return {
    gifs: Array.isArray(data?.gifs) ? data.gifs : [],
    nextPage: data?.nextPage ?? null,
  }
}
