/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'payroll-dashboard',
      cwd: __dirname,
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '4G',
      env: {
        NODE_ENV: 'production',
        PORT: 3012,
      },
    },
  ],
}
