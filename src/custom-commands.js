const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
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

function commandBlocks(command) {
  if (Array.isArray(command?.blocks) && command.blocks.length) return command.blocks;
  if (String(command?.response || '').trim()) {
    return [{ type: 'text', text: String(command.response) }];
  }
  return [];
}

function safeColor(value) {
  const text = String(value || '#5865F2').toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : '#5865F2';
}

function buildCommandPayload(command, message, args, canEmbed) {
  const textParts = [];
  const embeds = [];
  const buttons = [];

  for (const block of commandBlocks(command)) {
    if (!block || typeof block !== 'object') continue;

    if (block.type === 'text') {
      const text = renderResponse(block.text, message, args).trim();
      if (text) textParts.push(text);
      continue;
    }

    if (block.type === 'random') {
      const options = Array.isArray(block.options) ? block.options.filter(Boolean) : [];
      if (options.length) {
        const chosen = options[Math.floor(Math.random() * options.length)];
        const text = renderResponse(chosen, message, args).trim();
        if (text) textParts.push(text);
      }
      continue;
    }

    if (block.type === 'embed') {
      const title = renderResponse(block.title, message, args).trim();
      const description = renderResponse(block.description, message, args).trim();
      const footer = renderResponse(block.footer, message, args).trim();
      const imageUrl = String(block.imageUrl || '').trim();

      if (!canEmbed) {
        const fallback = [title, description, footer].filter(Boolean).join('\n');
        if (fallback) textParts.push(fallback);
        continue;
      }

      const embed = new EmbedBuilder().setColor(safeColor(block.color));
      if (title) embed.setTitle(title.slice(0, 256));
      if (description) embed.setDescription(description.slice(0, 4096));
      if (footer) embed.setFooter({ text: footer.slice(0, 2048) });
      if (/^https?:\/\//i.test(imageUrl)) embed.setImage(imageUrl);
      embeds.push(embed);
      continue;
    }

    if (block.type === 'button') {
      const label = renderResponse(block.label, message, args).trim();
      const url = String(block.url || '').trim();
      if (!label || !/^https?:\/\//i.test(url)) continue;
      buttons.push(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(label.slice(0, 80))
          .setURL(url)
      );
    }
  }

  const payload = {
    allowedMentions: {
      parse: [],
      users: [message.author.id],
      repliedUser: false
    }
  };

  const content = textParts.join('\n').trim();
  if (content) payload.content = content.slice(0, 2000);
  if (embeds.length) payload.embeds = embeds.slice(0, 10);
  if (buttons.length) {
    payload.components = [new ActionRowBuilder().addComponents(buttons.slice(0, 5))];
  }

  if (!payload.content && !payload.embeds?.length && !payload.components?.length) return null;
  return payload;
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

  const payload = buildCommandPayload(
    command,
    message,
    args,
    Boolean(permissions?.has(PermissionFlagsBits.EmbedLinks))
  );
  if (!payload) return;

  try {
    if (command.delivery === 'reply') await message.reply(payload);
    else await message.channel.send(payload);
    console.log(`[COMMANDS] ${trigger} used by ${message.author.tag} in ${message.guild.name}`);
  } catch (error) {
    console.warn(`[COMMANDS] Could not answer ${trigger} in ${message.guild.name}: ${error.message}`);
  }
}

module.exports = {
  handleCustomCommand,
  normalizeTrigger,
  renderResponse,
  buildCommandPayload
};
