# Phone Install Onboarding

Shadow Chat is a mobile-first PWA. First-time phone users should see a short, silent setup tutorial after login so they know how to install the app and enable notifications.

## Product Behavior

- `PhoneInstallOnboarding` opens once per user/browser on phone-like devices after the authenticated profile loads.
- The tutorial does not auto-open if the app is already running in standalone/Home Screen mode.
- Closing, skipping, finishing setup, or accepting the Android native install prompt marks the tutorial as seen for that user and onboarding version.
- Settings keeps the same tutorial under `App Setup & User Guide` so users can replay it later.
- The written steps remain in the modal beside the video for accessibility, failed media loads, and users who prefer scanning.
- Account creation can still mark setup as pending in local storage, but the current auto-open rule is first mobile post-login launch, not pending-only.

The marker is local to the browser/device. A user who signs in on a new phone browser can see the tutorial there even if they already dismissed it elsewhere.

## iPhone Flow

iPhone install is manual and must use Safari:

1. Open `https://shadochat.online` in Safari.
2. Tap Share.
3. Choose `Add to Home Screen`.
4. Keep `Open as Web App` on when shown.
5. Tap `Add`, then open Shadow Chat from the new Home Screen icon.
6. In Shadow Chat, open Settings > Notifications & Audio, tap `Enable Notifications`, and allow the prompt.

Chrome and Edge on iPhone cannot trigger the iOS Home Screen web-app install flow, so the app shows instructions instead of a fake install button.

## Android Flow

Android uses Chrome's native install prompt when available:

1. Open `https://shadochat.online` in Chrome.
2. Tap the menu, then choose `Add to Home screen` or `Install app`.
3. Confirm the install sheet.
4. Open Shadow Chat from the new Home Screen or launcher icon.
5. In Shadow Chat, open Settings > Notifications & Audio, tap `Enable Notifications`, and allow the browser/system prompt.

If the `beforeinstallprompt` event is available, the modal can show `Install Now` and call the native prompt directly. Otherwise, it falls back to the menu instructions.

## Video Assets

The app expects these silent tutorial videos:

- `public/tutorials/shadochat-setup-android.mp4`
- `public/tutorials/shadochat-notifications-android.mp4`

The iPhone tab temporarily reuses the Android install tutorial video until a good iPhone-specific recording is ready. The Android production clips are annotated screen recordings from a modern generic Android emulator. Replace these files directly when a new approved take is ready.

## Testing

Use disposable, confirmed Supabase users for this flow. Do not replace or delete the two stable `PLAYWRIGHT_ACCOUNT_*` smoke accounts.

Recommended checks:

1. Open a fresh phone-sized browser context for a user with no `shadowchat:phone-install-onboarding:v2` seen marker.
2. Sign in and verify the setup tutorial modal opens after the profile loads.
3. Check iPhone and Android tabs, video playback, written steps, replay, skip, and finish buttons.
4. Confirm the modal does not auto-open again after dismissal.
5. Confirm Settings > App Setup & User Guide can reopen the tutorial and Notification Setup, including the Android notification walkthrough video.
6. Delete any temporary auth user and confirm its `public.users` row is gone.

Useful references:

- [Apple: Turn a website into an app in Safari on iPhone](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iphea86e5236/ios)
- [Google Chrome Help: Use web apps on Android](https://support.google.com/chrome/answer/9658361)
- [web.dev: WebAPKs on Android](https://web.dev/articles/webapks)
