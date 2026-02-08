module.exports = {
  apps: [
    {
      name: 'agentops-preflight',
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      autorestart: true,
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Load .env.production via dotenv inside the app
      // PM2 will use env_production vars as overrides
      node_args: '-r dotenv/config',
      env: {
        DOTENV_CONFIG_PATH: '.env.production',
      },
      // Restart delay on crash (2 seconds)
      restart_delay: 2000,
      // Max restarts in 15 min window before stopping
      max_restarts: 10,
      min_uptime: '10s',
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
