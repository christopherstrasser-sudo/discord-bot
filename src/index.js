const { startBot } = require('./bot');
const { startWeb } = require('./web');

async function main() {
  console.log('=========================================');
  console.log(' RAKU DISCORD BOT');
  console.log('=========================================');

  await startBot();
  await startWeb();
}

main().catch(error => {
  console.error('[FATAL]', error.message);
  process.exitCode = 1;
});
