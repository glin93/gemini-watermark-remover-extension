'use strict';

var DEFAULT_SETTINGS = {
  enabled: true,
  outputFormat: 'png',
  totalCleaned: 0,
  lastCleanedAt: null
};

var pendingRename = null;

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS), function (current) {
    var patch = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
      if (typeof current[key] === 'undefined') {
        patch[key] = DEFAULT_SETTINGS[key];
      }
    });
    if (Object.keys(patch).length) {
      chrome.storage.local.set(patch);
    }
  });
});

chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
  var url = item.finalUrl || item.url || '';
  var referrer = item.referrer || '';
  var isGeminiDownload =
    url.indexOf('/rd-gg') !== -1 ||
    url.indexOf('googleusercontent.com') !== -1 ||
    referrer.indexOf('gemini.google.com') !== -1 ||
    referrer.indexOf('aistudio.google.com') !== -1;

  if (pendingRename && isGeminiDownload) {
    var nextName = pendingRename;
    pendingRename = null;
    suggest({ filename: nextName });
    return true;
  }
  suggest();
  return true;
});

chrome.runtime.onMessage.addListener(function (message) {
  if (!message || !message.type) return;

  if (message.type === 'renameDownload') {
    pendingRename = message.filename || null;
  }
});
