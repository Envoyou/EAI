module.exports = {
  apps: [
    {
      name: "eai-backend",
      script: "dist/server.js",
      cwd: "/var/www/eai-backend/current",
      env: {
        NODE_ENV: "production"
      },
      env_file: "/var/www/eai-backend/shared/.env.production",
      out_file: "/var/log/eai-backend/api-out.log",
      error_file: "/var/log/eai-backend/api-error.log",
      node_args: "--max-old-space-size=150",
      max_memory_restart: "150M"
    },
    {
      name: "eai-worker",
      script: "dist/worker.js",
      cwd: "/var/www/eai-backend/current",
      env: {
        NODE_ENV: "production"
      },
      env_file: "/var/www/eai-backend/shared/.env.production",
      out_file: "/var/log/eai-backend/worker-out.log",
      error_file: "/var/log/eai-backend/worker-error.log",
      node_args: "--max-old-space-size=150",
      max_memory_restart: "150M"
    }
  ]
}
