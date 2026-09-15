const { PermissionFlagsBits } = require('discord.js');
const { getGuildSettings } = require('./store');

const cooldowns = new Map();

function normalizeTrigger(value) {
  let trigger = String(value || '').trim().toLowerCase();
  if (!trigger) return '';
  if (!trigger.startsWith('!')) trigger = `!${trigger}`;
  return trigger;
}

function renderResponse(template, message, args) {
  const memberName = message.member?.displayName || message.author.globalName || message.author.username;
  return String(template || '')
    .replaceAll('{user}', `<@${message.author.id}>`)
    .replaceAll('{username}', message.author.username)
    .replaceAll('{displayName}', memberName)
    .replaceAll('{server}', message.guild.name)
    .replaceAll('{channel}', `<#${message.channel.id}>`)
    .replaceAll('{args}', args || '');
}

function cleanupCooldowns(now) {
  if (cooldowns.size < 5000) return;
  for (const [key, expiresAt] of cooldowns) {
    if (expiresAt <= now) cooldowns.delete(key);
  }
}

async function handleCustomCommand(message) {
  if (!message?.guild || !message.author || message.author.bot || message.webhookId) return;
  if (!message.content?.startsWith('!')) return;

  let settings;
  try {
    settings = getGuildSettings(message.guild.id);
  } catch (error) {
    console.warn(`[COMMANDS] Could not load settings for ${message.guild.name}: ${error.message}`);
    return;
  }

  if (!settings.customCommands?.enabled) return;

  const commands = Array.isArray(settings.customCommands.commands)
    ? settings.customCommands.commands
    : [];
  if (!commands.length) return;

  const trimmed = message.content.trim();
  const firstSpace = trimmed.search(/\s/);
  const rawTrigger = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const args = firstSpace === -1 ? '' : trimmed.slice(firstSpace).trim();
  const trigger = normalizeTrigger(rawTrigger);

  const command = commands.find(item => item?.enabled !== false && normalizeTrigger(item?.trigger) === trigger);
  if (!command) return;

  const me = message.guild.members.me;
  const permissions = me ? message.channel.permissionsFor(me) : null;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages)) {
    console.warn(`[COMMANDS] Missing send permission in #${message.channel.name || message.channel.id} on ${message.guild.name}`);
    return;
  }

  const cooldownSeconds = Math.max(0, Math.min(3600, Number(command.cooldownSeconds) || 0));
  const cooldownKey = `${message.guild.id}:${command.id || trigger}:${message.author.id}`;
  const now = Date.now();
  const expiresAt = cooldowns.get(cooldownKey) || 0;

  if (cooldownSeconds > 0 && expiresAt > now) return;
  if (cooldownSeconds > 0) cooldowns.set(cooldownKey, now + cooldownSeconds * 1000);
  cleanupCooldowns(now);

  const content = renderResponse(command.response, message, args).trim();
  if (!content) return;

  try {
    await message.channel.send({
      content: content.slice(0, 2000),
      allowedMentions: {
        parse: [],
        users: [message.author.id]
      }
    });
    console.log(`[COMMANDS] ${trigger} used by ${message.author.tag} in ${message.guild.name}`);
  } catch (error) {
    console.warn(`[COMMANDS] Could not answer ${trigger} in ${message.guild.name}: ${error.message}`);
  }
}

module.exports = {
  handleCustomCommand,
  normalizeTrigger,
  renderResponse
};
