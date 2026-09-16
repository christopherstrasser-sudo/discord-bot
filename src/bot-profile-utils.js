const MAX_NICKNAME = 32;
const MAX_BIO = 190;
const MAX_AVATAR_BYTES = 768 * 1024;
const AVATAR_PATTERN = /^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i;

function cleanText(value) {
  return String(value ?? '').replace(/\r/g, '').trim();
}

function validateNickname(value) {
  const nickname = cleanText(value);
  if (nickname.length > MAX_NICKNAME) throw new Error(`Der Bot-Name darf maximal ${MAX_NICKNAME} Zeichen lang sein.`);
  return nickname;
}

function validateBio(value) {
  const bio = cleanText(value);
  if (bio.length > MAX_BIO) throw new Error(`Die Bot-Bio darf maximal ${MAX_BIO} Zeichen lang sein.`);
  return bio;
}

function avatarBytes(dataUri) {
  const match = String(dataUri || '').match(AVATAR_PATTERN);
  if (!match) throw new Error('Avatar muss ein PNG-, JPG-, GIF- oder WebP-Bild sein.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length) throw new Error('Das Avatar-Bild ist leer.');
  if (bytes.length > MAX_AVATAR_BYTES) throw new Error('Der vorbereitete Avatar ist zu groß. Bitte verwende ein kleineres Bild.');
  return bytes.length;
}

function validateAvatarData(value) {
  const dataUri = String(value || '').trim();
  if (!dataUri) return '';
  avatarBytes(dataUri);
  return dataUri;
}

function guildMemberAvatarUrl(guildId, userId, avatarHash, size = 256) {
  if (!guildId || !userId || !avatarHash) return '';
  const ext = String(avatarHash).startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/guilds/${encodeURIComponent(guildId)}/users/${encodeURIComponent(userId)}/avatars/${encodeURIComponent(avatarHash)}.${ext}?size=${size}`;
}

function sanitizeBotProfileInput(body = {}) {
  const hasNickname = Object.prototype.hasOwnProperty.call(body, 'nickname');
  const hasBio = Object.prototype.hasOwnProperty.call(body, 'bio');
  const hasAvatar = Object.prototype.hasOwnProperty.call(body, 'avatarData');
  const resetAvatar = body.resetAvatar === true;

  return {
    hasNickname,
    hasBio,
    nickname: hasNickname ? validateNickname(body.nickname) : undefined,
    bio: hasBio ? validateBio(body.bio) : undefined,
    avatarData: hasAvatar ? validateAvatarData(body.avatarData) : undefined,
    resetAvatar
  };
}

module.exports = {
  MAX_NICKNAME,
  MAX_BIO,
  MAX_AVATAR_BYTES,
  validateNickname,
  validateBio,
  validateAvatarData,
  guildMemberAvatarUrl,
  sanitizeBotProfileInput
};