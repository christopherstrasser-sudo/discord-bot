require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://31.70.115.79:3000').replace(/\/$/, ''),
  discord: {
    clientId: required('DISCORD_CLIENT_ID'),
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    botToken: required('DISCORD_BOT_TOKEN')
  },
  sessionSecret: required('SESSION_SECRET')
};

config.discord.redirectUri = `${config.publicBaseUrl}/auth/discord/callback`;

module.exports = config;
