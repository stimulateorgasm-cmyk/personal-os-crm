#!/bin/bash
set -e

echo "=== DEPLOY CRM ==="

# 1. Backend: собрать и перезапустить
echo "[1/3] Building backend Docker image..."
cd /root/apps/crm/backend
docker compose -f /root/docker-compose.yml build crm-backend
echo "[1/3] Restarting backend container..."
docker compose -f /root/docker-compose.yml up -d crm-backend
sleep 3
echo "[1/3] Backend OK"

# 2. Frontend: clean build
echo "[2/3] Building frontend..."
cd /root/apps/crm/frontend
rm -rf dist node_modules/.vite
npm run build
echo "[2/3] Frontend build OK"

# 3. Deploy frontend to Caddy
echo "[3/3] Deploying to Caddy..."
rm -rf /var/www/crm/dist/*
cp -r dist/* /var/www/crm/dist/
systemctl restart caddy
echo "[3/3] Caddy restarted"

# 4. Verify
echo "=== VERIFICATION ==="
sleep 2
curl -sk https://crm.strah.fun/api/quiz/mens-stats | python3 -c "
import json,sys; d=json.load(sys.stdin)
leg = d.get('legacy_totals',{})
print(f'API: total={d[\"total\"]}, legacy_total={leg.get(\"total\")}')
print(f'UTM sources: {len(d.get(\"by_source\",[]))}')
"
echo ""
curl -sk https://crm.strah.fun/ | grep -o 'src="[^"]*"'
echo "=== DONE ==="
