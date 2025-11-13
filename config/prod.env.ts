const BASE_DOMAIN = '43.140.35.58'
const CHAT_URL = `http://${BASE_DOMAIN}:10008`
const API_URL = `http://${BASE_DOMAIN}:10002`
const WS_URL = `ws://${BASE_DOMAIN}:10001`

export default {
  NODE_ENV: 'production',
  CHAT_URL,
  API_URL,
  WS_URL,
  LOG_LEVEL: 5,
  VERSION: 'H5-Demo',
}
