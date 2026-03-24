module.exports = {
  apps: [
    {
      name: 'ctw-server',
      script: 'pnpm',
      args: 'run start:server',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true,
    }
  ]
};
