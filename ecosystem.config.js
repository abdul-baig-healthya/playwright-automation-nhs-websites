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
    // NOTE: playwright-ui requires a local display (Xvfb / desktop).
    // Do NOT start this on a headless server — use `--only dashboard` instead.
    // Start manually on local: npx playwright test --ui
    {
      name: "playwright-ui",
      script: "npx",
      args: "playwright test --ui --ui-host=0.0.0.0 --ui-port=8080",
      watch: false,
      autorestart: false,
      max_restarts: 0,
    },
  ],
};
