# Recognition App Release Section

Recognition popups reuse `public.app_releases.sections` JSON. A recognition
section must still include `heading` and `items` so older clients can render it
as a standard update section.

```json
{
  "kind": "recognition",
  "heading": "Community credit",
  "items": [
    "JJ submitted this request and it is now in the app.",
    "Keep sending feature requests and bug reports."
  ],
  "recognition": {
    "userId": "uuid",
    "username": "jj",
    "displayName": "JJ",
    "avatarUrl": "https://...",
    "avatarThumbnailUrl": "https://...",
    "bannerUrl": "https://...",
    "bannerThumbnailUrl": "https://...",
    "profileColor": "#c8b08a",
    "submissionId": "uuid",
    "submissionTitle": "Zoom feature on photos",
    "submissionType": "bug",
    "featureTitle": "Full-screen photo pinch zoom",
    "shippedAt": "2026-06-18T12:00:00.000Z"
  }
}
```
