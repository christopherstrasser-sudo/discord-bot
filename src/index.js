const config = require('./config');
const { client, startBot } = require('./bot');
const { createWebApp } = require('./web');
const { attachCommandBuilderApi } = require('./command-builder-api');
const { attachRoleStudioApi } = require('./role-studio-api');
const { attachEmojiApi } = require('./emoji-api');
const { attachTicketStudioApi } = require('./ticket-studio-api');
const { attachTicketRuntime } = require('./ticket-studio-runtime');
require('./creator-tiktok-provider-v097-patch');
const { attachCreatorHubApi } = require('./creator-hub-api');
const { startCreatorRuntime } = require('./creator-runtime');
const { attachVoiceStudioApi } = require('./voice-studio-api');
const { attachVoiceStudioRuntime } = require('./voice-studio-runtime');
const { retryTransient, formatErrorDetails } = require('./startup-utils');

function isDisallowedIntentError(error) {
  const message = String(error?.message || '');
  return message.toLowerCase().includes('disallowed intent');
}

function startDashboard() {
  const app = createWebApp();
  attachCommandBuilderApi(app);
  attachRoleStudioApi(app);
  attachEmojiApi(app);
  attachTicketStudioApi(app);
  attachCreatorHubApi(app);
  attachVoiceStudioApi(app);

  return new Promise(resolve => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[WEB] Dashboard: ${config.publicBaseUrl}`);
      console.log(`[WEB] Discord callback: ${config.discord.redirectUri}`);
      resolve(server);
    });
  });
}

async function startDiscordBot() {
  return retryTransient(
    () => startBot(),
    {
      attempts: 5,
      delays: [2000, 4000, 8000, 12000],
      onRetry: ({ details, nextAttempt, attempts, delayMs }) => {
        console.log(`[BOT] Discord Login temporär fehlgeschlagen: ${details}`);
        console.log(`[BOT] Neuer Versuch ${nextAttempt}/${attempts} in ${Math.round(delayMs / 1000)}s ...`);
      }
    }
  );
}

async function main() {
  console.log('=========================================');
  console.log(' RAKU DISCORD BOT');
  console.log('=========================================');

  attachTicketRuntime(client);
  attachVoiceStudioRuntime(client);

  try {
    await startDiscordBot();
    startCreatorRuntime(client);
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
  console.log(`[STARTUP] Der Dienst konnte nicht gestartet werden: ${formatErrorDetails(error)}`);
  process.exitCode = 1;
});
