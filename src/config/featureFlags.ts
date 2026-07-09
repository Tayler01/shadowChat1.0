export const BOARDS_FEATURE_ENABLED =
  typeof __SHADOWCHAT_BOARDS_ENABLED__ !== 'undefined' && __SHADOWCHAT_BOARDS_ENABLED__ === true

export const ESP_ADMIN_FEATURE_ENABLED =
  typeof __SHADOWCHAT_ESP_ADMIN_ENABLED__ !== 'undefined' && __SHADOWCHAT_ESP_ADMIN_ENABLED__ === true

export const SHADOWCHAT_FEATURES = Object.freeze({
  boards: BOARDS_FEATURE_ENABLED,
  news: BOARDS_FEATURE_ENABLED,
  espAdmin: ESP_ADMIN_FEATURE_ENABLED,
})
