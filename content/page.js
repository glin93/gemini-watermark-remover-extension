'use strict';

(function () {
  var state = {
    enabled: true,
    outputFormat: 'png'
  };

  var masks = {};
  var masksReady = false;
  var downloadPending = false;
  var pendingTimer = null;
  var pendingTimeoutMs = 15000;
  var filenameCounter = 0;

  var nativeFetch = window.fetch;
  var nativeCreateObjectURL = URL.createObjectURL.bind(URL);

  var currentSite = window.location.href.indexOf('aistudio.google.com') !== -1 ? 'aistudio' : 'gemini';

  function isDownloadIntentText(text) {
    if (typeof text !== 'string') return false;
    var normalized = text.trim().toLowerCase();
    if (!normalized) return false;
    return [
      'download',
      'скач',
      'загруз',
      '下載',
      '下载',
      'ダウンロード',
      '다운로드'
    ].some(function (needle) {
      return normalized.indexOf(needle) !== -1;
    });
  }

  function shouldArmFromEvent(event) {
    if (!event || typeof event.composedPath !== 'function') return false;
    var path = event.composedPath();
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (!node || node.nodeType !== 1 || typeof node.getAttribute !== 'function') continue;
      var candidates = [
        node.getAttribute('aria-label') || '',
        node.getAttribute('mattooltip') || '',
        node.getAttribute('data-tooltip') || '',
        node.getAttribute('title') || ''
      ];
      var textContent = node.textContent || '';
      if (textContent.length <= 200) candidates.push(textContent);
      for (var j = 0; j < candidates.length; j++) {
        if (isDownloadIntentText(candidates[j])) return true;
      }
    }
    return false;
  }

  function armDownload(reason) {
    downloadPending = true;
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(function () {
      downloadPending = false;
      pendingTimer = null;
    }, pendingTimeoutMs);

    window.postMessage({
      source: 'gclean-page',
      type: 'GCLEAN_ARMED',
      reason: reason || 'unknown'
    }, '*');
  }

  ['mousedown', 'pointerdown', 'touchstart', 'keydown'].forEach(function (eventName) {
    window.addEventListener(eventName, function (event) {
      if (!state.enabled) return;
      if (!shouldArmFromEvent(event)) return;
      armDownload('native_button');
    }, true);
  });

  function parseUrl(url) {
    try {
      return new URL(url, window.location.href);
    } catch (error) {
      return null;
    }
  }

  function isGeminiImageHost(url) {
    var parsed = parseUrl(url);
    if (!parsed) return false;
    var host = parsed.hostname.toLowerCase();
    return host.indexOf('googleusercontent.com') !== -1 ||
      host.indexOf('usercontent.google.com') !== -1 ||
      host.indexOf('google.com') !== -1;
  }

  function isGeminiDownloadUrl(url) {
    if (typeof url !== 'string') return false;
    if (url.indexOf('blob:') === 0 || url.indexOf('data:image/') === 0) return true;
    if (!isGeminiImageHost(url)) return false;

    return /\/rd-gg(?:-dl)?\/[^-]/.test(url) ||
      /\/gg-dl\/[^-]/.test(url);
  }

  function getRequestUrl(args) {
    if (typeof args[0] === 'string') return args[0];
    if (args[0] && args[0].url) return args[0].url;
    return '';
  }

  function buildFilename(extension) {
    filenameCounter++;
    var now = new Date();
    var stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-') + '_' + [
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0')
    ].join('-');
    return 'gemini-clean-' + stamp + '-' + String(filenameCounter).padStart(3, '0') + extension;
  }

  function createCleanResponse(response, cleanBlob) {
    var headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.set('content-type', cleanBlob.type);

    return new Response(cleanBlob, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
  }

  function shouldProcessResponse(url, response) {
    if (isGeminiDownloadUrl(url)) return true;

    var finalUrl = response.url || url || '';
    if (!isGeminiImageHost(finalUrl)) return false;

    var disposition = (response.headers.get('content-disposition') || '').toLowerCase();
    if (disposition.indexOf('attachment') !== -1 || disposition.indexOf('filename=') !== -1) {
      return true;
    }

    return false;
  }

  function processDownloadResponse(response) {
    if (!response.ok) return response;

    var fallback = response.clone();
    return response.blob().then(function (blob) {
      if (!blob.type || blob.type.indexOf('image/') !== 0) return fallback;

      return gcleanProcessImage(blob, masks, nativeCreateObjectURL, state.outputFormat).then(function (result) {
        console.info('[Gemini Clean Local] processed download', {
          matched: result.matched,
          forceApplied: result.forceApplied,
          width: result.width,
          height: result.height,
          configKey: result.configKey,
          score: result.matchScore,
          edgeScore: result.edgeScore,
          deltaScore: result.deltaScore,
          contrastScore: result.contrastScore,
          hitRate: result.hitRate,
          searchMode: result.searchMode,
          offsetX: result.offsetX,
          offsetY: result.offsetY,
          attemptedConfigs: result.attemptedConfigs
        });

        var filename = buildFilename(result.extension);
        window.postMessage({
          source: 'gclean-page',
          type: 'GCLEAN_RENAME',
          filename: filename
        }, '*');

        window.postMessage({
          source: 'gclean-page',
          type: 'GCLEAN_PROCESSED',
          matched: result.matched,
          forceApplied: result.forceApplied,
          filename: filename,
          width: result.width,
          height: result.height,
          configKey: result.configKey,
          score: result.matchScore,
          edgeScore: result.edgeScore,
          deltaScore: result.deltaScore,
          contrastScore: result.contrastScore,
          hitRate: result.hitRate,
          searchMode: result.searchMode,
          offsetX: result.offsetX,
          offsetY: result.offsetY,
          attemptedConfigs: result.attemptedConfigs
        }, '*');

        downloadPending = false;
        window.clearTimeout(pendingTimer);
        pendingTimer = null;

        return createCleanResponse(response, result.blob);
      }).catch(function () {
        return fallback;
      });
    }).catch(function () {
      return fallback;
    });
  }

  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var url = getRequestUrl(args);
    var isCandidateRequest = isGeminiDownloadUrl(url) ||
      (currentSite === 'aistudio' && (url.indexOf('blob:') === 0 || url.indexOf('data:image/') === 0)) ||
      isGeminiImageHost(url);

    if (!state.enabled || !masksReady || !downloadPending || !isCandidateRequest) {
      return nativeFetch.apply(window, args);
    }

    return nativeFetch.apply(window, args).then(function (response) {
      var contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.indexOf('text/') === 0) return response;
      if (!shouldProcessResponse(url, response)) return response;
      return processDownloadResponse(response);
    });
  };

  Promise.all([
    gcleanLoadMaskImageData(BANANA_MASK_48_BASE64),
    gcleanLoadMaskImageData(BANANA_MASK_96_BASE64),
    gcleanLoadMaskImageData(BANANA_MASK_V2_160_BASE64)
  ]).then(function (loaded) {
    masks['48'] = loaded[0];
    masks['96'] = loaded[1];
    masks['v2_160'] = loaded[2];
    masksReady = true;
  });

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.source !== 'gclean-bridge') return;

    if (event.data.type === 'GCLEAN_STATE') {
      state.enabled = event.data.enabled !== false;
      state.outputFormat = event.data.outputFormat || 'png';
    }

    if (event.data.type === 'GCLEAN_ARM') {
      armDownload(event.data.reason || 'clean_button');
    }
  });
})();
