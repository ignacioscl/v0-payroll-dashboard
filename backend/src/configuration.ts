export default () => ({
  port: parseInt(process.env.PORT!, 10) ?? 8100,
  nodeEnv: process.env.NODE_ENV,
  sentryDSN: process.env.SENTRY_DSN,
  jwtSecret: process.env.JWT_SECRET,
  tokenExpiresIn: process.env.TOKEN_EXPIRES_IN,
  refreshExpiresIn: process.env.REFRESH_EXPIRES_IN,
  initAdmin: process.env.INIT_ADMIN,
  initAdminPassword: process.env.INIT_ADMIN_PASSWORD,
  apiEndpoint: process.env.API_ENDPOINT,
})
