const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder
} = require('discord.js');
const { getGuildSettings } = require('./store');

const BUTTON_STYLES = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger
};

function customEmojiData(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const custom = raw.match(/^<(a?):([A-Za-z0-9_]+):(\d{15,22})>$/);
  if (custom) {
    return {
      animated: custom[1] === 'a',
      name: custom[2],
      id: custom[3]
    };
  }

  return { name: raw };
}

function emojiKeyFromConfig(value) {
  const raw = String(value || '').trim();
  const custom = raw.match(/^<a?:[A-Za-z0-9_]+:(\d{15,22})>$/);
  if (custom) return `id:${custom[1]}`;
  return raw ? `name:${raw}` : '';
}

function emojiKeyFromReaction(reaction) {
  if (reaction?.emoji?.id) return `id:${reaction.emoji.id}`;
  return reaction?.emoji?.name ? `name:${reaction.emoji.name}` : '';
}

function panelItems(panel) {
  return Array.isArray(panel?.items) ? panel.items.filter(Boolean) : [];
}

function buildPanelPayload(panel) {
  const embed = new EmbedBuilder()
    .setColor(/^#[0-9A-F]{6}$/i.test(String(panel.color || '')) ? panel.color : '#5865F2')
    .setTitle(String(panel.title || 'Rollen auswählen').slice(0, 256));

  const description = String(panel.description || '').trim();
  if (description) embed.setDescription(description.slice(0, 4096));

  const modeText = panel.mode === 'reactions'
    ? 'Reagiere mit einem Emoji, um deine Rolle zu verwalten.'
    : panel.mode === 'select'
      ? 'Wähle deine Rollen im Menü unter dieser Nachricht.'
      : 'Klicke auf einen Button, um deine Rolle zu verwalten.';

  const selectionText = panel.selectionMode === 'single'
    ? 'Eine Rolle aus dieser Gruppe'
    : 'Mehrere Rollen möglich';

  embed.setFooter({ text: `${modeText} · ${selectionText}`.slice(0, 2048) });

  const payload = {
    embeds: [embed],
    components: []
  };

  const items = panelItems(panel);

  if (panel.mode === 'buttons') {
    for (let start = 0; start < items.length; start += 5) {
      const row = new ActionRowBuilder();
      const buttons = items.slice(start, start + 5).map(item => {
        const button = new ButtonBuilder()
          .setCustomId(`raku_role:${panel.id}:${item.id}`)
          .setLabel(String(item.label || 'Rolle').slice(0, 80))
          .setStyle(BUTTON_STYLES[item.style] || ButtonStyle.Secondary);

        const emoji = customEmojiData(item.emoji);
        if (emoji) button.setEmoji(emoji);
        return button;
      });
      row.addComponents(buttons);
      payload.components.push(row);
    }
  }

  if (panel.mode === 'select') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`raku_roles:${panel.id}`)
      .setPlaceholder(String(panel.placeholder || 'Rollen auswählen …').slice(0, 150))
      .setMinValues(1);

    const options = items.map(item => {
      const option = {
        label: String(item.label || 'Rolle').slice(0, 100),
        value: item.id
      };
      const descriptionText = String(item.description || '').trim();
      if (descriptionText) option.description = descriptionText.slice(0, 100);
      const emoji = customEmojiData(item.emoji);
      if (emoji) option.emoji = emoji;
      return option;
    });

    if (panel.allowRemove !== false) {
      options.unshift({
        label: panel.selectionMode === 'single' ? 'Auswahl entfernen' : 'Alle Panel-Rollen entfernen',
        value: '__clear__',
        emoji: { name: '✕' }
      });
    }

    select.addOptions(options.slice(0, 25));
    select.setMaxValues(panel.selectionMode === 'single' ? 1 : Math.min(options.length, 25));

    payload.components = [new ActionRowBuilder().addComponents(select)];
  }

  return payload;
}

function findPanel(settings, panelId) {
  if (!settings?.rolePanels?.enabled) return null;
  const panels = Array.isArray(settings.rolePanels.panels) ? settings.rolePanels.panels : [];
  return panels.find(panel => panel?.id === panelId && panel.enabled !== false) || null;
}

async function resolveMember(interaction) {
  if (interaction.member?.roles?.cache) return interaction.member;
  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

async function manageableRole(guild, roleId) {
  if (!roleId) return null;
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return null;

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.managed || role.id === guild.id) return null;
  if (role.position >= me.roles.highest.position) return null;
  return role;
}

async function changeMemberRoles(member, panel, desiredItemIds, exactSync) {
  const items = panelItems(panel);
  const desiredSet = new Set(desiredItemIds);
  const desiredRoles = [];
  const allPanelRoles = [];

  for (const item of items) {
    const role = await manageableRole(member.guild, item.roleId);
    if (!role) continue;
    allPanelRoles.push(role);
    if (desiredSet.has(item.id)) desiredRoles.push(role);
  }

  const desiredIds = new Set(desiredRoles.map(role => role.id));
  const removeRoles = exactSync
    ? allPanelRoles.filter(role => member.roles.cache.has(role.id) && !desiredIds.has(role.id))
    : [];
  const addRoles = desiredRoles.filter(role => !member.roles.cache.has(role.id));

  if (removeRoles.length) {
    await member.roles.remove(removeRoles, 'RAKU Role Studio selection');
  }
  if (addRoles.length) {
    await member.roles.add(addRoles, 'RAKU Role Studio selection');
  }

  return {
    added: addRoles.map(role => role.name),
    removed: removeRoles.map(role => role.name)
  };
}

async function handleButtonInteraction(interaction, panel, itemId) {
  const member = await resolveMember(interaction);
  if (!member) throw new Error('Mitglied konnte nicht geladen werden.');

  const item = panelItems(panel).find(entry => entry.id === itemId);
  if (!item) throw new Error('Diese Rollen-Auswahl existiert nicht mehr.');

  const role = await manageableRole(interaction.guild, item.roleId);
  if (!role) throw new Error('Diese Rolle kann der Bot aktuell nicht verwalten.');

  const hasRole = member.roles.cache.has(role.id);
  let desiredIds = [];
  let exactSync = false;

  if (panel.selectionMode === 'single') {
    exactSync = true;
    if (!hasRole || panel.allowRemove === false) desiredIds = [item.id];
  } else if (hasRole) {
    if (panel.allowRemove === false) desiredIds = [];
    else {
      await member.roles.remove(role, 'RAKU Role Studio toggle');
      return { added: [], removed: [role.name], unchanged: false };
    }
  } else {
    await member.roles.add(role, 'RAKU Role Studio toggle');
    return { added: [role.name], removed: [], unchanged: false };
  }

  if (panel.selectionMode === 'single' && hasRole && panel.allowRemove === false) {
    desiredIds = [item.id];
  }

  const result = await changeMemberRoles(member, panel, desiredIds, exactSync);
  result.unchanged = !result.added.length && !result.removed.length;
  return result;
}

async function handleSelectInteraction(interaction, panel) {
  const member = await resolveMember(interaction);
  if (!member) throw new Error('Mitglied konnte nicht geladen werden.');

  const values = Array.isArray(interaction.values) ? interaction.values : [];
  const clear = values.includes('__clear__');
  const desired = clear
    ? []
    : values.filter(value => panelItems(panel).some(item => item.id === value));

  const exactSync = panel.selectionMode === 'single' || panel.allowRemove !== false;
  return changeMemberRoles(member, panel, desired, exactSync);
}

function feedbackText(result) {
  const parts = [];
  if (result.added?.length) parts.push(`Hinzugefügt: **${result.added.join(', ')}**`);
  if (result.removed?.length) parts.push(`Entfernt: **${result.removed.join(', ')}**`);
  if (!parts.length) return 'Deine Rollen waren bereits so eingestellt.';
  return parts.join('\n');
}

async function handleRoleInteraction(interaction) {
  if (!interaction?.guild || (!interaction.isButton?.() && !interaction.isStringSelectMenu?.())) return false;

  const customId = String(interaction.customId || '');
  const buttonMatch = customId.match(/^raku_role:([^:]+):([^:]+)$/);
  const selectMatch = customId.match(/^raku_roles:([^:]+)$/);
  if (!buttonMatch && !selectMatch) return false;

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  try {
    const settings = getGuildSettings(interaction.guild.id);
    const panelId = buttonMatch?.[1] || selectMatch?.[1];
    const panel = findPanel(settings, panelId);
    if (!panel) throw new Error('Dieses Rollen-Panel ist aktuell deaktiviert.');

    const result = buttonMatch
      ? await handleButtonInteraction(interaction, panel, buttonMatch[2])
      : await handleSelectInteraction(interaction, panel);

    await interaction.editReply({ content: `✅ ${feedbackText(result)}` });
  } catch (error) {
    const content = `⚠️ ${error.message || 'Rolle konnte nicht geändert werden.'}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => null);
    else await interaction.reply({ content, ephemeral: true }).catch(() => null);
  }

  return true;
}

async function handleRoleReaction(reaction, user, added) {
  if (!reaction || !user || user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message?.partial) await reaction.message.fetch();
  } catch {
    return;
  }

  const message = reaction.message;
  const guild = message?.guild;
  if (!guild) return;

  let settings;
  try {
    settings = getGuildSettings(guild.id);
  } catch {
    return;
  }

  if (!settings.rolePanels?.enabled) return;
  const panels = Array.isArray(settings.rolePanels.panels) ? settings.rolePanels.panels : [];
  const panel = panels.find(entry =>
    entry?.enabled !== false &&
    entry.mode === 'reactions' &&
    entry.messageId === message.id
  );
  if (!panel) return;

  const key = emojiKeyFromReaction(reaction);
  const item = panelItems(panel).find(entry => emojiKeyFromConfig(entry.emoji) === key);
  if (!item?.roleId) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;
  const role = await manageableRole(guild, item.roleId);
  if (!role) return;

  try {
    if (added) {
      if (panel.selectionMode === 'single') {
        await changeMemberRoles(member, panel, [item.id], true);

        for (const other of panelItems(panel)) {
          if (other.id === item.id) continue;
          const otherKey = emojiKeyFromConfig(other.emoji);
          const otherReaction = message.reactions.cache.find(candidate => emojiKeyFromReaction(candidate) === otherKey);
          if (otherReaction) otherReaction.users.remove(user.id).catch(() => null);
        }
      } else if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, 'RAKU Role Studio reaction');
      }
    } else if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'RAKU Role Studio reaction');
    }
  } catch (error) {
    console.warn(`[ROLE STUDIO] Reaction role failed in ${guild.name}: ${error.message}`);
  }
}

module.exports = {
  buildPanelPayload,
  customEmojiData,
  emojiKeyFromConfig,
  handleRoleInteraction,
  handleRoleReaction
};
