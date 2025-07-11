importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

(async () => {
  const params = new URL(self.location.href).searchParams;
  const supabaseUrl = params.get('supabaseUrl') || '';
  const functionsUrl = supabaseUrl
    ? supabaseUrl.replace('.supabase.co', '.functions.supabase.co')
    : '';

  const res = await fetch(`${functionsUrl}/firebase-config`);
  const { firebaseConfig } = await res.json();

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    self.registration.showNotification(payload.notification.title, {
      body: payload.notification.body,
      icon: '/icons/icon-192.png',
    });
  });
})();
