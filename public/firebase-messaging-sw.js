importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDwEGv1PRl9GLZwE-QdCnXCEiFn-fRPZt0',
  authDomain: 'shadowchat-99822.firebaseapp.com',
  projectId: 'shadowchat-99822',
  messagingSenderId: '255265121159',
  appId: '1:255265121159:web:4806c7207776bd5af9a922',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: '/icons/icon-192.png',
  });
});
