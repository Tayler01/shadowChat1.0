# Phone Install Onboarding

Shadow Chat is a PWA. New accounts should be guided into adding it to their phone Home Screen instead of being left to find browser install menus on their own.

## Product Behavior

- Account creation marks phone setup as pending in local storage by email, and by user id when Supabase returns one.
- After the new user has an active session, `PhoneInstallOnboarding` opens the guided setup modal unless the app is already running in standalone mode.
- Closing the modal or tapping `I Added It` records the guide as seen for that user.
- Settings keeps a `Phone App Setup` section so anyone can reopen the guide later.

The onboarding marker is local to the browser that created the account. This avoids interrupting existing users and the stable Playwright smoke accounts.

## iPhone Flow

iPhone install is manual and must use Safari:

1. Open Shadow Chat in Safari.
2. Tap Share.
3. Choose `Add to Home Screen`.
4. Tap `Add`, then open Shadow Chat from the new Home Screen icon.

Chrome and Edge on iPhone cannot trigger the PWA install prompt, so the app shows instructions instead of a fake install button.

## Android Flow

Android uses the browser install prompt when available:

1. The app captures `beforeinstallprompt` at the app shell level.
2. The guide shows `Install Now` when the deferred prompt exists.
3. If the prompt is unavailable, the guide falls back to Chrome menu instructions: menu, `Install app` or `Add to Home screen`, confirm.

## Testing

Use disposable, confirmed Supabase users for this flow. Do not replace or delete the two stable `PLAYWRIGHT_ACCOUNT_*` smoke accounts.

Recommended checks:

1. Create a temporary confirmed auth user with a unique email and username.
2. Open a fresh Playwright context.
3. Set the local storage key through the app by signing up, or seed the pending marker for the temp email before sign-in.
4. Sign in and verify the phone setup modal opens.
5. Check the iPhone tab text, Android tab text, and Settings `Phone App Setup` reopen path.
6. Delete the temporary auth user and confirm its `public.users` row is gone.

Useful references:

- [Apple: Turn a website into an app in Safari on iPhone](https://support.apple.com/guide/iphone/turn-a-website-into-an-app-iphea86e5236/ios)
- [web.dev: PWA installation prompt](https://web.dev/learn/pwa/installation-prompt)
- [MDN: Trigger installation from your PWA](https://developer.mozilla.org/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
