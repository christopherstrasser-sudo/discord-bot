const legacy = require('./creator-tiktok-provider');
const next = require('./creator-tiktok-provider-v097');
Object.assign(legacy, next);
module.exports = legacy;
