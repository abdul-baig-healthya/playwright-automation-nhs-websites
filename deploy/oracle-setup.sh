#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Oracle Cloud Free Tier — Playwright Dashboard Setup
# Target: Ubuntu 22.04, ARM64 (VM.Standard.A1.Flex)
#
# Usage:
#   chmod +x oracle-setup.sh && ./oracle-setup.sh
#
# Run as the default 'ubuntu' user (NOT root).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_URL="https://github.com/hardik-143/playwright-automation-nhs-websites.git"
APP_DIR="$HOME/playwright-dashboard"
DASHBOARD_PORT=7890
NODE_VERSION=20
SWAP_SIZE_GB=2

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
step()  { echo -e "\n${GREEN}=== $* ===${NC}"; }
warn()  { echo -e "${YELLOW}WARN: $*${NC}"; }
error() { echo -e "${RED}ERROR: $*${NC}"; exit 1; }

[[ $EUID -eq 0 ]] && error "Do not run this script as root. Run as the 'ubuntu' user."

# ── 1. Swap ───────────────────────────────────────────────────────────────────
step "1. Add ${SWAP_SIZE_GB}GB swap (helps when Chromium spikes memory)"
if swapon --show | grep -q /swapfile; then
  echo "Swap already configured — skipping."
else
  sudo fallocate -l "${SWAP_SIZE_GB}G" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "Swap enabled: ${SWAP_SIZE_GB}GB"
fi

# ── 2. System update ──────────────────────────────────────────────────────────
step "2. System update"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y

# ── 3. Node.js ────────────────────────────────────────────────────────────────
step "3. Install Node.js ${NODE_VERSION}"
if node --version 2>/dev/null | grep -q "^v${NODE_VERSION}"; then
  echo "Node.js ${NODE_VERSION} already installed."
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node --version && npm --version

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
step "4. Install PM2"
sudo npm install -g pm2
pm2 --version

# ── 5. Clone / update repo ────────────────────────────────────────────────────
step "5. Clone repository → $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  echo "Repo exists — pulling latest..."
  git -C "$APP_DIR" pull
else
  git clone "$REPO_URL" "$APP_DIR"
fi

# ── 6. Install Node dependencies ──────────────────────────────────────────────
step "6. npm ci (all deps including devDependencies for Playwright)"
npm ci --prefix "$APP_DIR"

# ── 7. Playwright browsers ───────────────────────────────────────────────────
step "7. Install Playwright Chromium + system dependencies"
(cd "$APP_DIR" && npx playwright install chromium --with-deps)

# ── 8. Firewall (UFW) ─────────────────────────────────────────────────────────
step "8. Configure UFW firewall"
sudo ufw allow OpenSSH
sudo ufw allow "${DASHBOARD_PORT}/tcp" comment "Playwright Dashboard"
sudo ufw --force enable
sudo ufw status

# ── 9. Cleanup cron (prevent disk fill from trace/video artifacts) ─────────────
step "9. Add cron job to clean up old test artifacts (7-day retention)"
CRON_CMD="0 3 * * * find ${APP_DIR}/test-results -mindepth 1 -mtime +7 -delete 2>/dev/null; find ${APP_DIR}/playwright-report -mindepth 1 -mtime +7 -delete 2>/dev/null"
( crontab -l 2>/dev/null | grep -v "playwright-dashboard"; echo "$CRON_CMD" ) | crontab -
echo "Cron installed."

# ── 10. Start dashboard with PM2 ─────────────────────────────────────────────
step "10. Start dashboard with PM2"
pm2 delete dashboard 2>/dev/null || true
pm2 start ecosystem.config.js --only dashboard --cwd "$APP_DIR"
pm2 save

# ── 11. PM2 startup on boot ───────────────────────────────────────────────────
step "11. Configure PM2 to start on boot"
# Run the startup command explicitly (more reliable than tail-pipe approach)
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$(whoami)" --hp "$HOME"
pm2 save
echo "PM2 startup configured."

# ── Done ──────────────────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "<your-vm-ip>")

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Playwright Dashboard deployed!                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Dashboard URL:  ${YELLOW}http://${PUBLIC_IP}:${DASHBOARD_PORT}${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT — Oracle VCN Security List (do this in Oracle Console):${NC}"
echo ""
echo "  1. Go to: Oracle Cloud Console → Networking → Virtual Cloud Networks"
echo "  2. Click your VCN → Security Lists → Default Security List"
echo "  3. Click 'Add Ingress Rules' and add:"
echo ""
echo "     Source Type:   CIDR"
echo "     Source CIDR:   0.0.0.0/0   (or restrict to your IP for safety)"
echo "     IP Protocol:   TCP"
echo "     Dest Port:     ${DASHBOARD_PORT}"
echo ""
echo "  Without this step the dashboard will not be reachable externally."
echo ""
echo "  Run 'pm2 logs dashboard' to see live logs."
echo ""
