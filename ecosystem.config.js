module.exports = {
  apps: [
    {
      name: "dashboard",
      script: "dashboard.js",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "playwright-ui",
      script: "npx",
      args: "playwright test --ui --ui-host=0.0.0.0 --ui-port=8080",
      watch: false,
      autorestart: true,
      max_restarts: 10,
    },
  ],
};
