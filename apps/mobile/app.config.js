const { expo } = require('./app.json');

module.exports = ({ config }) => {
  const edition = process.env.SHADOWCHAT_APP_EDITION || 'full';
  if (edition === 'full') return { ...config, ...expo };
  if (edition !== 'streamlined') throw new Error('Unknown ShadowChat app edition.');
  const rawOrigin = process.env.SHADOWCHAT_STREAMLINED_WEB_ORIGIN;
  let origin;
  try { origin = new URL(rawOrigin); } catch { throw new Error('Set the deployed streamlined HTTPS origin before building.'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.port ||
      origin.pathname !== '/' || origin.search || origin.hash ||
      origin.hostname === 'shadochat.online' || origin.hostname === 'www.shadochat.online' ||
      origin.hostname === 'localhost' || /^\d+(?:\.\d+){3}$/.test(origin.hostname)) {
    throw new Error('The streamlined build requires its own HTTPS origin, without paths or credentials.');
  }
  const buildNumber = process.env.SHADOWCHAT_IOS_BUILD_NUMBER || '22';
  if (!/^\d+$/.test(buildNumber) || Number(buildNumber) < 22) throw new Error('Streamlined iOS build number must be at least 22.');
  return {
    ...config, ...expo,
    ios: { ...expo.ios, buildNumber },
    extra: { ...expo.extra, appEdition: 'streamlined', webAppUrl: origin.origin, communities: {
      schemaVersion:1,demoEnabled:process.env.SHADOWCHAT_DEMO_COMMUNITY_ENABLED==='true',
      demo:{origin:process.env.SHADOWCHAT_DEMO_WEB_ORIGIN,projectRef:process.env.SHADOWCHAT_DEMO_PROJECT_REF,
        supabaseUrl:process.env.EXPO_PUBLIC_DEMO_SUPABASE_URL,publicKey:process.env.EXPO_PUBLIC_DEMO_SUPABASE_KEY},
    } },
    plugins: [...expo.plugins.map(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
      ? ['expo-splash-screen', {
        backgroundColor: '#0d0f10',
        image: './assets/images/shado-round-mark.png',
        imageWidth: 96,
        resizeMode: 'contain',
        ios: { backgroundColor: '#0d0f10', image: './assets/images/shado-round-mark.png', imageWidth: 96 },
        android: { backgroundColor: '#0d0f10', image: './assets/images/shado-round-mark.png', imageWidth: 96 },
      }]
      : plugin), './plugins/with-streamlined-store-permissions'],
  };
};
