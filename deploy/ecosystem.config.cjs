// pm2 start deploy/ecosystem.config.cjs   → deja la API corriendo 24/7 en la EC2
// pm2 save && pm2 startup                 → que vuelva a arrancar si se reinicia la instancia
module.exports = {
  apps: [
    {
      name: 'api-test-aws',
      script: 'server.js',
      cwd: __dirname + '/..',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      // Logs en archivo para que el CloudWatch agent los levante (ver cloudwatch-agent.json)
      out_file: '/var/log/api-test-aws/out.log',
      error_file: '/var/log/api-test-aws/error.log',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
