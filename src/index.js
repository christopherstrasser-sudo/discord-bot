const config = require('./config');
const { startBot } = require('./bot');
const { createWebApp } = require('./web');
const { attachCommandBuilderApi } = require('./command-builder-api');

function isDisallowedIntentError(error) {
  const message = String(error?.message || '');
  return message.toLowerCase().includes('disallowed intent');
}

function startDashboard() {
  const app = createWebApp();
  attachCommandBuilderApi(app);

  return new Promise(resolve => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[WEB] Dashboard: ${config.publicBaseUrl}`);
      console.log(`[WEB] Discord callback: ${config.discord.redirectUri}`);
      resolve(server);
    });
  });
}

async function main() {
  console.log('=========================================');
  console.log(' RAKU DISCORD BOT');
  console.log('=========================================');

  try {
    await startBot();
  } catch (error) {
    if (!isDisallowedIntentError(error)) throw error;

    console.log('');
    console.log('[SETUP] Mindestens ein benötigter Discord Gateway Intent ist noch nicht aktiviert.');
    console.log('[SETUP] Developer Portal -> Bot -> Privileged Gateway Intents');
    console.log('[SETUP] -> Server Members Intent einschalten');
    console.log('[SETUP] -> Message Content Intent einschalten');
    console.log('[SETUP] -> Änderungen speichern und den Bot neu starten.');
    console.log('[SETUP] Das Web-Dashboard wird bis dahin ohne Bot-Verbindung gestartet.');
    console.log('');
  }

  await startDashboard();
}

main().catch(error => {
  console.log(`[STARTUP] Der Dienst konnte nicht gestartet werden: ${error.message}`);
  process.exitCode = 1;
});
