'use strict';

var enabledInput = document.getElementById('enabled');
var outputFormatSelect = document.getElementById('outputFormat');
var totalCleanedEl = document.getElementById('totalCleaned');
var lastCleanedAtEl = document.getElementById('lastCleanedAt');
var resetStatsButton = document.getElementById('resetStats');

function render(state) {
  enabledInput.checked = state.enabled !== false;
  outputFormatSelect.value = state.outputFormat || 'png';
  totalCleanedEl.textContent = String(Number(state.totalCleaned) || 0);
  if (!state.lastCleanedAt) {
    lastCleanedAtEl.textContent = '从未';
  } else {
    var date = new Date(state.lastCleanedAt);
    lastCleanedAtEl.textContent = isNaN(date.getTime()) ? '未知' : date.toLocaleString();
  }
}

function refresh() {
  chrome.storage.local.get(['enabled', 'outputFormat', 'totalCleaned', 'lastCleanedAt'], render);
}

refresh();

enabledInput.addEventListener('change', function () {
  chrome.storage.local.set({ enabled: enabledInput.checked });
});

outputFormatSelect.addEventListener('change', function () {
  chrome.storage.local.set({ outputFormat: outputFormatSelect.value });
});

resetStatsButton.addEventListener('click', function () {
  chrome.storage.local.set({
    totalCleaned: 0,
    lastCleanedAt: null
  });
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local') return;
  if (changes.enabled || changes.outputFormat || changes.totalCleaned || changes.lastCleanedAt) {
    refresh();
  }
});
