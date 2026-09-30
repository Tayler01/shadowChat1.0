# Installed-PWA keyboard accessory investigation

## Device evidence

Tayler's Home Screen iPhone app retains WebKit's previous/next/done accessory
strip across the tested textarea, editable, form and picker combinations. The
system text prompt lacks the strip, but its separate single-line modal does
not preserve the required inline chat experience and was rejected. TestFlight
build 16 preserves the same hosted composer and removes the strip.

## What distinguishes the native host

React Native WebView's `hideKeyboardAccessoryView` operates on the native
WKWebView responder: it creates a native subclass whose accessory-view getter
returns nil. Ordinary PWA page JavaScript has no equivalent UIKit responder
configuration. This is an architectural explanation supported by source, not
proof that Apple will never provide a web opt-out.
[WebView native implementation](https://github.com/react-native-webview/react-native-webview/blob/v13.16.1/apple/RNCWebViewImpl.m).

Accessibility transparency/contrast changes alter appearance; there is no
documented exact-strip removal. `UIDesignRequiresCompatibility` is a native
Info.plist option, not a web manifest flag, and Apple ignores it for apps built
for iOS 27 or later. Current device diagnostics report EditContext unavailable;
the open WebKit implementation issue does not demonstrate accessory removal.
[Apple compatibility property](https://developer.apple.com/documentation/bundleresources/information-property-list/uidesignrequirescompatibility),
[WebKit EditContext issue](https://bugs.webkit.org/show_bug.cgi?id=269922).

## Credible next PWA action

Prepare a reduced WebKit/Apple feedback case with the exact device/OS/user-agent,
standalone context, single inline composer and the supplied screenshots. Attach
the same-device PWA-present/native-absent comparison and request a supported
single-editor accessory opt-out. Record engine versions and a reproducible
page without account or clipboard contents. This document prepares that case;
it has not been sent to Apple or external maintainers.

No additional random CSS, keyboard settings or form attribute combinations are
recommended for physical testing without a source-backed candidate. Native
App Store distribution is the currently device-confirmed toolbar-free route;
it does not change the accessory strip in existing installed PWAs.
