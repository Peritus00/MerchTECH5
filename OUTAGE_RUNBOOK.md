# Outage Runbook

Quick reference for diagnosing and recovering from MerchTrader outages.

## Fast Checks (5 minutes)

### 1. App health
```bash
curl -s https://www.merchtrader.org/api/health | jq .
curl -s https://www.merchtrader.org/api/health/liveness
```
- **200** = healthy or degraded
- **503** = unhealthy (DB/S3 down)
- **Timeout / connection refused** = app down or unreachable

### 2. Database reachability
```bash
# From project root
node test-correct-database.js
```
Or check Neon console: https://console.neon.tech/  
- Status "Suspended" = normal; auto-resumes on connection
- Status "Error" = investigate

### 3. Provider status
- **Railway**: https://status.railway.app/
- **Neon**: https://neon.tech/status
- **AWS S3**: https://health.aws.amazon.com/health/status

### 4. Recent logs
- Railway: Project → Service → Deployments → View logs
- Look for: `Connection terminated unexpectedly`, `db_pool_error`, `uncaught_exception`, `graceful shutdown`

## Recovery Actions

### If DB disconnect caused crash
1. **No restart needed** – transient disconnects are now handled; app should recover.
2. If app is down: restart/redeploy via Railway or EB.
3. Check Neon: ensure DB is not suspended or in maintenance.

### If app is down (503 / unreachable)
1. **Redeploy** – often fixes stuck processes.
2. **Check env vars** – `DATABASE_URL`, `JWT_SECRET` must be set.
3. **Verify startup** – logs should show DB reachable before accepting traffic.

### If health returns 503 but app responds
- DB or S3 unhealthy
- Check Neon console and S3/AWS credentials
- App will continue running; fix DB/S3 and health will recover

### If playback fails
- Check `/api/health/playback` – returns 503 if streaming broken
- Verify S3 bucket and credentials
- Test: `curl -H "Range: bytes=0-1" https://www.merchtrader.org/api/media/[ID]/stream`

## Post-deploy verification

After any deployment, run:
```bash
API_BASE_URL=https://www.merchtrader.org node scripts/verify-deployment-health.js
```
Exit 0 = healthy; exit 1 = fail rollout.

## Escalation

| Level | When | Action |
|-------|------|--------|
| 1 | Health 503 for 5+ min | Check DB/S3, redeploy |
| 2 | App unreachable 15+ min | Full redeploy, check provider status |
| 3 | Data loss suspected | Stop changes, check Neon backups |

## Simulated DB-disconnect drill (staging/dev only)

Run periodically to verify resilience. **Do not run in production.**

1. **Start the server** (local or staging):
   ```bash
   cd services/Server && node main.js
   ```

2. **Verify health**:
   ```bash
   curl -s http://localhost:5001/api/health | jq .status
   # Should return "healthy"
   ```

3. **Simulate disconnect** – temporarily break DB (e.g. wrong `DATABASE_URL`, or pause Neon in console).

4. **Observe**:
   - Health should return 503 (not 200).
   - App should **not** crash; logs may show `db_pool_error` or `recoverable_db_exception_ignored`.
   - Requests may return 500 until DB is back.

5. **Restore DB** – fix `DATABASE_URL` or resume Neon.

6. **Verify recovery**:
   ```bash
   curl -s http://localhost:5001/api/health | jq .status
   # Should return "healthy" within 1–2 minutes
   ```

7. **Success criteria**: Process never exited; health recovered without restart.

## Related docs

- [QUICK_RECOVERY_GUIDE.md](QUICK_RECOVERY_GUIDE.md) – EB redeploy steps
- [MONITORING_SETUP_GUIDE.md](MONITORING_SETUP_GUIDE.md) – UptimeRobot/Pingdom setup
- [DIAGNOSIS_AND_RECOVERY_SUMMARY.md](DIAGNOSIS_AND_RECOVERY_SUMMARY.md) – Past incident summary
