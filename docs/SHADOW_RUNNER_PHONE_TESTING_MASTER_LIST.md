# Shadow Runner Phone Testing Master List

Collect user-reported issues here during physical-phone testing. Do not implement
or deploy fixes until the user requests the consolidated patch. Reports are not
independently reproduced unless explicitly noted.

## SR-PHONE-001 - Landscape rotation and fallback prompt

- Reported: 2026-09-30.
- Status: Patch prepared on 2026-10-05 after the user resumed the full goal;
  regression and phone-browser checks pass. Not deployed.
- Area: Phone orientation, including the main menu.
- Observed: Automatic/forced landscape rotation no longer works, at least on
  the main menu.
- Requested: Prompt the player to rotate their phone when forced rotation does
  not work or is unavailable.
- Patch acceptance: In portrait, show a clear rotate-phone prompt, including on
  the main menu. Dismiss it when landscape is reached. Keep supported automatic
  landscape rotation best-effort; do not rely on it as the only path.
- Device/browser/installed-PWA mode: Not yet specified.
- Confirmed cause: The existing orientation gate was restricted to gameplay;
  the title screen and map never displayed its fallback prompt.
- Change: Apply the existing gate to every Runner screen, use explicit sideways
  rotation copy, preserve the selected screen after rotation, and keep Exit
  available while portrait. Supported automatic rotation is unchanged.
- Checks: 25 focused Jest tests; lint, app TypeScript, configured production
  build and docs integrity passed on integrated main. WebKit portrait passed 19 UI/lifecycle
  surfaces; Android Chromium passed 21. Portrait prompt screenshot reviewed.
  These are browser profiles, not physical installed-PWA confirmation.
- Rotation also suspends hidden loading/options/journal/save/finale dialog focus
  traps; dialogs retain their state when landscape returns. The rotate prompt
  owns keyboard focus, and Escape cannot close a hidden journal or finale.
