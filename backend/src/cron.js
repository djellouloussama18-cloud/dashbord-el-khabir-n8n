const conversationsRepo = require('./repositories/conversations.repo');

const PAUSE_CHECK_INTERVAL = 5 * 60 * 1000;

let timer = null;

async function checkPausedBots() {
  try {
    const reEnabled = await conversationsRepo.autoReEnablePaused();
    if (reEnabled.length > 0) {
      console.log(`[cron] Auto re-enabled ${reEnabled.length} paused bot(s)`);
    }
  } catch (err) {
    console.error('[cron] Error checking paused bots:', err.message);
  }
}

function startCronJobs() {
  if (timer) return;
  console.log(`[cron] Starting — checking paused bots every ${PAUSE_CHECK_INTERVAL / 1000}s`);
  timer = setInterval(checkPausedBots, PAUSE_CHECK_INTERVAL);
  checkPausedBots();
}

function stopCronJobs() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('[cron] Stopped');
  }
}

module.exports = { startCronJobs, stopCronJobs };
