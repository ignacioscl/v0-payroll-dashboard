module.exports = {
  apps: [
    {
      name: 'srs-suite-backend',
      script: 'npm',
      args: 'run start:prod',
      env_file: '.env.prod',
      watch: ['.env.prod'],
      ignore_watch: ['node_modules'],
      env: {
        NODE_ENV: 'production',
        DB_MIGRATIONS_RUN: 'true',
      },
      watch_options: {
        followSymlinks: false,
        usePolling: true,
      },
    },
  ],
}
