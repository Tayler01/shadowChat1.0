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
  const buildNumber = process.env.SHADOWCHAT_IOS_BUILD_NUMBER || '20';
  if (!/^\d+$/.test(buildNumber) || Number(buildNumber) < 20) throw new Error('Streamlined iOS build number must be at least 20.');
  return {
    ...config, ...expo,
    ios: { ...expo.ios, buildNumber },
    extra: { ...expo.extra, appEdition: 'streamlined', webAppUrl: origin.origin },
    plugins: [...expo.plugins, './plugins/with-streamlined-store-permissions'],
  };
};
