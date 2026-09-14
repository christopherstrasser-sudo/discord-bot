const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  console.log(`[BOT] Connected to ${client.guilds.cache.size} guild(s)`);
});

client.on('guildCreate', guild => {
  console.log(`[BOT] Added to guild: ${guild.name} (${guild.id})`);
});

client.on('guildDelete', guild => {
  console.log(`[BOT] Removed from guild: ${guild.name} (${guild.id})`);
});

async function startBot() {
  await client.login(config.discord.botToken);
  return client;
}

module.exports = { client, startBot };
