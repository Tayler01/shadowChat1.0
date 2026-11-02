/** Preserve the player URL contract while opting YouTube into its documented privacy-enhanced mode. */
export function youtubePrivacyEnhancedUrl(value: string): URL {
  const url = new URL(value)
  if (['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(url.hostname.toLowerCase())) {
    url.protocol = 'https:'
    url.hostname = 'www.youtube-nocookie.com'
  }
  return url
}
