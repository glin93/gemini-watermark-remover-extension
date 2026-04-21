'use strict';

(function () {
  var SETTINGS_KEYS = ['enabled', 'outputFormat', 'totalCleaned', 'lastCleanedAt'];
  var state = {
    enabled: true,
    outputFormat: 'png',
    totalCleaned: 0,
    lastCleanedAt: null
  };
  var observer = null;
  var toastTimer = null;

  function getMessage(text) {
    return String(text || '');
  }

  function injectStyles() {
    if (document.getElementById('gclean-local-style')) return;
    var style = document.createElement('style');
    style.id = 'gclean-local-style';
    style.textContent =
      '.gclean-local-target{' +
        'outline:2px solid rgba(34,197,94,.55);outline-offset:2px;border-radius:12px;' +
        'box-shadow:0 0 0 4px rgba(34,197,94,.12);' +
      '}' +
      '.gclean-local-badge{' +
        'display:inline-flex;align-items:center;justify-content:center;margin-left:8px;' +
        'padding:4px 8px;border-radius:999px;background:linear-gradient(135deg,#14532d,#22c55e);' +
        'color:#fff;font:700 11px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
        'letter-spacing:.02em;vertical-align:middle;user-select:none;pointer-events:none;' +
      '}' +
      '#gclean-local-toast{' +
        'position:fixed;right:18px;bottom:18px;z-index:2147483647;padding:12px 14px;border-radius:14px;' +
        'background:#111827;color:#fff;font:500 13px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;' +
        'box-shadow:0 18px 40px rgba(0,0,0,.28);max-width:320px;opacity:0;transform:translateY(8px);' +
        'transition:opacity .18s ease,transform .18s ease;' +
      '}' +
      '#gclean-local-toast[data-visible="true"]{opacity:1;transform:translateY(0);}' +
      '#gclean-local-toast strong{display:block;font-size:13px;margin-bottom:2px;}';
    document.documentElement.appendChild(style);
  }

  function ensureToast() {
    var toast = document.getElementById('gclean-local-toast');
    if (toast) return toast;
    toast = document.createElement('div');
    toast.id = 'gclean-local-toast';
    document.documentElement.appendChild(toast);
    return toast;
  }

  function showToast(title, body) {
    var toast = ensureToast();
    toast.innerHTML = '<strong>' + title + '</strong><span>' + body + '</span>';
    toast.setAttribute('data-visible', 'true');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.setAttribute('data-visible', 'false');
    }, 2600);
  }

  function sendState() {
    window.postMessage({
      source: 'gclean-bridge',
      type: 'GCLEAN_STATE',
      enabled: state.enabled,
      outputFormat: state.outputFormat
    }, '*');
  }

  function loadState(callback) {
    chrome.storage.local.get(SETTINGS_KEYS, function (data) {
      state.enabled = data.enabled !== false;
      state.outputFormat = data.outputFormat || 'png';
      state.totalCleaned = Number(data.totalCleaned) || 0;
      state.lastCleanedAt = data.lastCleanedAt || null;
      callback();
    });
  }

  function isDownloadButton(button) {
    if (!button || button.dataset.gcleanEnhanced === 'true') return false;
    var text = [
      button.getAttribute('aria-label') || '',
      button.getAttribute('mattooltip') || '',
      button.getAttribute('data-tooltip') || '',
      button.getAttribute('title') || '',
      button.textContent || ''
    ].join(' ').toLowerCase();

    return text.indexOf('download') !== -1 ||
      text.indexOf('скач') !== -1 ||
      text.indexOf('загруз') !== -1 ||
      text.indexOf('下载') !== -1 ||
      text.indexOf('下載') !== -1 ||
      text.indexOf('ダウンロード') !== -1 ||
      text.indexOf('다운로드') !== -1;
  }

  function armForNativeDownload() {
    if (!state.enabled) {
      showToast('Gemini Clean Local', '弹窗里当前处于关闭状态。');
      return;
    }
    showToast('Gemini Clean Local', '已接管这次下载，等待 Gemini 返回图片。');
    window.postMessage({
      source: 'gclean-bridge',
      type: 'GCLEAN_ARM',
      reason: 'native_button'
    }, '*');
  }

  function createBadge() {
    var badge = document.createElement('span');
    badge.className = 'gclean-local-badge';
    badge.textContent = 'Clean';
    return badge;
  }

  function enhanceDownloadButtons() {
    var buttons = document.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var nativeButton = buttons[i];
      if (!isDownloadButton(nativeButton)) continue;
      nativeButton.dataset.gcleanEnhanced = 'true';
      nativeButton.classList.add('gclean-local-target');

      ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'click'].forEach(function (eventName) {
        nativeButton.addEventListener(eventName, function () {
          armForNativeDownload();
        }, true);
      });

      if (!nativeButton.nextElementSibling || !nativeButton.nextElementSibling.classList || !nativeButton.nextElementSibling.classList.contains('gclean-local-badge')) {
        nativeButton.insertAdjacentElement('afterend', createBadge());
      }
    }
  }

  function startObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(function () {
      enhanceDownloadButtons();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true
    });
    enhanceDownloadButtons();
  }

  function bumpCounters(filename, matched, details) {
    state.totalCleaned += 1;
    state.lastCleanedAt = new Date().toISOString();
    chrome.storage.local.set({
      totalCleaned: state.totalCleaned,
      lastCleanedAt: state.lastCleanedAt
    });

    if (matched) {
      showToast(details && details.forceApplied ? '已强制净化并下载' : '已净化并下载', getMessage(filename));
    } else {
      var score = details && typeof details.score === 'number' ? details.score.toFixed(1) : '?';
      showToast('已下载原图结果', '未达到净化阈值，score=' + score + '，建议手动检查。');
    }
  }

  injectStyles();
  loadState(function () {
    sendState();
    startObserver();
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    var changed = false;
    if (changes.enabled) {
      state.enabled = changes.enabled.newValue !== false;
      changed = true;
    }
    if (changes.outputFormat) {
      state.outputFormat = changes.outputFormat.newValue || 'png';
      changed = true;
    }
    if (changes.totalCleaned) {
      state.totalCleaned = Number(changes.totalCleaned.newValue) || 0;
    }
    if (changes.lastCleanedAt) {
      state.lastCleanedAt = changes.lastCleanedAt.newValue || null;
    }
    if (changed) sendState();
  });

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'gclean-page') return;

    if (event.data.type === 'GCLEAN_RENAME') {
      chrome.runtime.sendMessage({
        type: 'renameDownload',
        filename: event.data.filename
      });
    }

    if (event.data.type === 'GCLEAN_PROCESSED') {
      bumpCounters(event.data.filename, !!event.data.matched, {
        forceApplied: !!event.data.forceApplied,
        score: event.data.score,
        edgeScore: event.data.edgeScore,
        deltaScore: event.data.deltaScore,
        configKey: event.data.configKey
      });
    }
  });
})();
