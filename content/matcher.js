'use strict';

var GCLEAN_LOGO_VALUE = 255;
var GCLEAN_ALPHA_THRESHOLD = 0.002;
var GCLEAN_MAX_ALPHA = 0.99;
var GCLEAN_MATCH_SCORE_THRESHOLD = 30;
var GCLEAN_FORCE_SCORE_THRESHOLD = 2;
var GCLEAN_MASK_ALPHA_MIN = 0.10;
var GCLEAN_CLEAR_ALPHA_MAX = 0.02;

function gcleanGet2dContext(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
}

function gcleanCalculateAlpha(r, g, b) {
  return Math.max(r, g, b) / 255;
}

function gcleanReverseBlendPixel(watermarked, alpha) {
  if (alpha < GCLEAN_ALPHA_THRESHOLD) return watermarked;
  var clampedAlpha = Math.min(alpha, GCLEAN_MAX_ALPHA);
  var original = (watermarked - clampedAlpha * GCLEAN_LOGO_VALUE) / (1 - clampedAlpha);
  return Math.round(Math.min(255, Math.max(0, original)));
}

function gcleanGetWatermarkConfigs(imageWidth, imageHeight) {
  var configs = [];

  if (imageWidth >= 48 + 32 && imageHeight >= 48 + 32) {
    configs.push({ logoSize: 48, marginRight: 32, marginBottom: 32, maskKey: '48', searchRadius: 12, searchStep: 3 });
  }

  if (imageWidth >= 96 + 64 && imageHeight >= 96 + 64) {
    configs.push({ logoSize: 96, marginRight: 64, marginBottom: 64, maskKey: '96', searchRadius: 20, searchStep: 4 });
  }

  if (imageWidth >= 160 && imageHeight >= 160) {
    configs.push({ logoSize: 160, marginRight: 0, marginBottom: 0, maskKey: 'v2_160', searchRadius: 24, searchStep: 4 });
  }

  return configs;
}

function gcleanDetectWatermarkRegion(regionPixels, width, height) {
  var detectThreshold = 20;
  var neighborDist = 3;
  var count = 0;

  for (var y = neighborDist; y < height - neighborDist; y++) {
    for (var x = neighborDist; x < width - neighborDist; x++) {
      var index = (y * width + x) * 4;
      var bright = (regionPixels[index] + regionPixels[index + 1] + regionPixels[index + 2]) / 3;
      var neighbors = [
        ((y - neighborDist) * width + x) * 4,
        ((y + neighborDist) * width + x) * 4,
        (y * width + (x - neighborDist)) * 4,
        (y * width + (x + neighborDist)) * 4
      ];
      var average = 0;
      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        average += (regionPixels[n] + regionPixels[n + 1] + regionPixels[n + 2]) / 3;
      }
      average /= neighbors.length;
      if (bright - average > detectThreshold) count++;
    }
  }

  return count;
}

function gcleanLuma(r, g, b) {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

function gcleanEstimateMaskDelta(regionPixels, maskPixels) {
  var maskedSum = 0;
  var maskedWeight = 0;
  var clearSum = 0;
  var clearCount = 0;

  for (var i = 0; i < regionPixels.length; i += 4) {
    var alpha = gcleanCalculateAlpha(maskPixels[i], maskPixels[i + 1], maskPixels[i + 2]);
    var luma = gcleanLuma(regionPixels[i], regionPixels[i + 1], regionPixels[i + 2]);

    if (alpha >= GCLEAN_MASK_ALPHA_MIN) {
      maskedSum += luma * alpha;
      maskedWeight += alpha;
    } else if (alpha <= GCLEAN_CLEAR_ALPHA_MAX) {
      clearSum += luma;
      clearCount++;
    }
  }

  if (!maskedWeight || !clearCount) return 0;
  return Math.max(0, maskedSum / maskedWeight - clearSum / clearCount);
}

function gcleanEstimateMaskContrast(regionPixels, maskPixels, width, height) {
  var neighborDist = 2;
  var contrastSum = 0;
  var contrastWeight = 0;
  var activeWeight = 0;
  var hitWeight = 0;

  for (var y = neighborDist; y < height - neighborDist; y++) {
    for (var x = neighborDist; x < width - neighborDist; x++) {
      var index = (y * width + x) * 4;
      var alpha = gcleanCalculateAlpha(maskPixels[index], maskPixels[index + 1], maskPixels[index + 2]);
      if (alpha < GCLEAN_MASK_ALPHA_MIN) continue;

      var center = gcleanLuma(regionPixels[index], regionPixels[index + 1], regionPixels[index + 2]);
      var neighbors = [
        ((y - neighborDist) * width + x) * 4,
        ((y + neighborDist) * width + x) * 4,
        (y * width + (x - neighborDist)) * 4,
        (y * width + (x + neighborDist)) * 4
      ];
      var average = 0;
      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        average += gcleanLuma(regionPixels[n], regionPixels[n + 1], regionPixels[n + 2]);
      }
      average /= neighbors.length;

      var delta = center - average;
      activeWeight += alpha;
      if (delta > 0) {
        contrastSum += delta * alpha;
        contrastWeight += alpha;
      }
      if (delta > 2) hitWeight += alpha;
    }
  }

  return {
    contrastScore: contrastWeight ? contrastSum / contrastWeight : 0,
    hitRate: activeWeight ? hitWeight / activeWeight : 0
  };
}

function gcleanBuildMatchScore(edgeScore, deltaScore, contrastScore, hitRate) {
  return edgeScore +
    Math.max(0, deltaScore - 1) * 4 +
    contrastScore * 8 +
    hitRate * 18;
}

function gcleanApplyReverseBlend(imagePixels, maskPixels) {
  for (var i = 0; i < imagePixels.length; i += 4) {
    var alpha = gcleanCalculateAlpha(maskPixels[i], maskPixels[i + 1], maskPixels[i + 2]);
    if (alpha < GCLEAN_ALPHA_THRESHOLD) continue;
    imagePixels[i] = gcleanReverseBlendPixel(imagePixels[i], alpha);
    imagePixels[i + 1] = gcleanReverseBlendPixel(imagePixels[i + 1], alpha);
    imagePixels[i + 2] = gcleanReverseBlendPixel(imagePixels[i + 2], alpha);
  }
}

function gcleanLoadMaskImageData(base64Url) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var context = gcleanGet2dContext(canvas);
      context.drawImage(img, 0, 0);
      resolve(context.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = function () {
      reject(new Error('Failed to load Gemini watermark mask.'));
    };
    img.src = base64Url;
  });
}

function gcleanBlobToImage(blob, createObjectURL) {
  return new Promise(function (resolve, reject) {
    var objectUrl = createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      resolve(img);
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image blob.'));
    };
    img.src = objectUrl;
  });
}

var GCLEAN_FORMATS = {
  png: { mime: 'image/png', extension: '.png' },
  webp: { mime: 'image/webp', extension: '.webp', quality: 0.90 },
  jpeg: { mime: 'image/jpeg', extension: '.jpg', quality: 0.92 }
};

function gcleanCanvasToBlob(canvas, format) {
  return new Promise(function (resolve) {
    canvas.toBlob(function (blob) {
      resolve(blob);
    }, format.mime, format.quality);
  });
}

function gcleanIsBetterCandidate(candidate, best) {
  if (!best) return true;
  if (candidate.score !== best.score) return candidate.score > best.score;
  if ((candidate.edgeScore || 0) !== (best.edgeScore || 0)) return (candidate.edgeScore || 0) > (best.edgeScore || 0);
  return candidate.config.logoSize > best.config.logoSize;
}

function gcleanScoreConfigAt(context, imageWidth, imageHeight, config, maskData, offsetX, offsetY) {
  if (imageWidth < config.logoSize + config.marginRight || imageHeight < config.logoSize + config.marginBottom) {
    return null;
  }

  var x = imageWidth - config.logoSize - config.marginRight + offsetX;
  var y = imageHeight - config.logoSize - config.marginBottom + offsetY;
  if (x < 0 || y < 0 || x + config.logoSize > imageWidth || y + config.logoSize > imageHeight) {
    return null;
  }

  var region = context.getImageData(x, y, config.logoSize, config.logoSize);
  var edgeScore = gcleanDetectWatermarkRegion(region.data, config.logoSize, config.logoSize);
  var deltaScore = gcleanEstimateMaskDelta(region.data, maskData.data);
  var contrastMetrics = gcleanEstimateMaskContrast(region.data, maskData.data, config.logoSize, config.logoSize);
  var score = gcleanBuildMatchScore(edgeScore, deltaScore, contrastMetrics.contrastScore, contrastMetrics.hitRate);
  return {
    config: config,
    score: score,
    edgeScore: edgeScore,
    deltaScore: deltaScore,
    contrastScore: contrastMetrics.contrastScore,
    hitRate: contrastMetrics.hitRate,
    x: x,
    y: y,
    offsetX: offsetX,
    offsetY: offsetY,
    region: region
  };
}

function gcleanFindBestCandidate(context, imageWidth, imageHeight, configs, masks) {
  var best = null;
  var attemptedConfigs = [];
  var i;

  for (i = 0; i < configs.length; i++) {
    var config = configs[i];
    var maskData = masks[config.maskKey];
    if (!maskData) continue;
    attemptedConfigs.push(config.maskKey);
    var baseCandidate = gcleanScoreConfigAt(context, imageWidth, imageHeight, config, maskData, 0, 0);
    if (baseCandidate && gcleanIsBetterCandidate(baseCandidate, best)) {
      baseCandidate.searchMode = 'base';
      best = baseCandidate;
    }
  }

  if (best && best.score >= GCLEAN_MATCH_SCORE_THRESHOLD) {
    return {
      best: best,
      attemptedConfigs: attemptedConfigs
    };
  }

  for (i = 0; i < configs.length; i++) {
    var fallbackConfig = configs[i];
    var fallbackMask = masks[fallbackConfig.maskKey];
    if (!fallbackMask) continue;
    var radius = fallbackConfig.searchRadius || 0;
    var step = fallbackConfig.searchStep || 1;

    for (var offsetY = -radius; offsetY <= radius; offsetY += step) {
      for (var offsetX = -radius; offsetX <= radius; offsetX += step) {
        if (offsetX === 0 && offsetY === 0) continue;
        var candidate = gcleanScoreConfigAt(context, imageWidth, imageHeight, fallbackConfig, fallbackMask, offsetX, offsetY);
        if (candidate && gcleanIsBetterCandidate(candidate, best)) {
          candidate.searchMode = 'fallback';
          best = candidate;
        }
      }
    }
  }

  return {
    best: best,
    attemptedConfigs: attemptedConfigs
  };
}

function gcleanPickForcedConfig(configs, masks) {
  for (var i = configs.length - 1; i >= 0; i--) {
    if (masks[configs[i].maskKey]) return configs[i];
  }
  return null;
}

function gcleanProcessImage(blob, masks, createObjectURL, outputFormat) {
  return gcleanBlobToImage(blob, createObjectURL).then(function (img) {
    var configs = gcleanGetWatermarkConfigs(img.width, img.height);

    var canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    var context = gcleanGet2dContext(canvas);
    context.drawImage(img, 0, 0);

    var searchResult = gcleanFindBestCandidate(context, img.width, img.height, configs, masks);
    var bestCandidate = searchResult.best;
    var attemptedConfigs = searchResult.attemptedConfigs;
    var forceApplied = false;

    if (!bestCandidate) {
      return {
        blob: blob,
        width: img.width,
        height: img.height,
        matched: false,
        matchScore: 0,
        edgeScore: 0,
        deltaScore: 0,
        contrastScore: 0,
        hitRate: 0,
        configKey: 'none',
        attemptedConfigs: attemptedConfigs,
        searchMode: 'none',
        offsetX: 0,
        offsetY: 0,
        forceApplied: false,
        extension: (GCLEAN_FORMATS[outputFormat] || GCLEAN_FORMATS.png).extension
      };
    }

    var matched = bestCandidate.score >= GCLEAN_MATCH_SCORE_THRESHOLD;
    if (!matched) {
      var forcedConfig = gcleanPickForcedConfig(configs, masks);
      var forcedMask = forcedConfig ? masks[forcedConfig.maskKey] : null;
      var forcedCandidate = forcedMask ? gcleanScoreConfigAt(context, img.width, img.height, forcedConfig, forcedMask, 0, 0) : null;
      if (forcedCandidate) {
        forcedCandidate.searchMode = 'force';
        bestCandidate = forcedCandidate;
        matched = true;
        forceApplied = true;
      }
    }

    var regionData = bestCandidate.region;
    var maskData = masks[bestCandidate.config.maskKey];

    if (matched && maskData) {
      gcleanApplyReverseBlend(regionData.data, maskData.data);
      context.putImageData(regionData, bestCandidate.x, bestCandidate.y);
    }

    var format = GCLEAN_FORMATS[outputFormat] || { mime: blob.type, extension: '.png' };
    return gcleanCanvasToBlob(canvas, format).then(function (resultBlob) {
      return {
        blob: resultBlob,
        width: img.width,
        height: img.height,
        matched: matched,
        matchScore: bestCandidate.score,
        edgeScore: bestCandidate.edgeScore || 0,
        deltaScore: bestCandidate.deltaScore || 0,
        contrastScore: bestCandidate.contrastScore || 0,
        hitRate: bestCandidate.hitRate || 0,
        configKey: bestCandidate.config.maskKey,
        attemptedConfigs: attemptedConfigs,
        searchMode: bestCandidate.searchMode || 'base',
        offsetX: bestCandidate.offsetX || 0,
        offsetY: bestCandidate.offsetY || 0,
        forceApplied: forceApplied,
        extension: format.extension
      };
    });
  });
}

if (typeof window !== 'undefined') {
  window.gcleanLoadMaskImageData = gcleanLoadMaskImageData;
  window.gcleanProcessImage = gcleanProcessImage;
}
