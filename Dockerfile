# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — Playwright Dashboard
# Recommended: Use oracle-setup.sh (bare-metal) on ARM64 Oracle VMs instead.
# This Dockerfile is for AMD64 (x86_64) environments.
# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Create artifact directories with correct permissions
RUN mkdir -p test-results playwright-report

EXPOSE 7890

CMD ["node", "dashboard.js"]
