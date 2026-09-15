const legacy = require('./creator-tiktok-provider');
require('./tiktok-signature-browser-fetch').installBrowserFetchFallback();
const next = require('./creator-tiktok-provider-v097');
Object.assign(legacy, next);
module.exports = legacy;
