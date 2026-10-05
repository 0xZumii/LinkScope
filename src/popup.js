// Popup settings for LinkScope.

const DEFAULTS = {
  enabled: true,
  mode: 'shift',
  delayMs: 500,
  fetchPreview: true,
  allowScreenshots: 'isolated', // 'isolated' | 'normal' | false
  showDomainInfo: false,
};

const RENDER_MEMORY_KEY = 'renderMemory';

const els = {
  enabled: document.getElementById('enabled'),
  fetchPreview: document.getElementById('fetchPreview'),
  allowScreenshots: document.getElementById('allowScreenshots'),
  showDomainInfo: document.getElementById('showDomainInfo'),
  reset: document.getElementById('reset'),
  clearMemory: document.getElementById('clearMemory'),
  memoryCount: document.getElementById('memoryCount'),
};

function apply(settings) {
  els.enabled.checked = settings.enabled;
  els.fetchPreview.checked = settings.fetchPreview;
  els.allowScreenshots.value = settings.allowScreenshots === 'normal' ? 'normal' : 'isolated';
  els.showDomainInfo.checked = settings.showDomainInfo;
}

function renderMemoryCount() {
  chrome.storage.local.get({ [RENDER_MEMORY_KEY]: {} }, (stored) => {
    const n = Object.keys(stored?.[RENDER_MEMORY_KEY] || {}).length;
    els.memoryCount.textContent = `${n} host${n === 1 ? '' : 's'}`;
  });
}

function save(patch) {
  chrome.storage.sync.set(patch);
}

chrome.storage.sync.get(DEFAULTS, (stored) => apply({ ...DEFAULTS, ...stored }));
renderMemoryCount();

els.enabled.addEventListener('change', () => save({ enabled: els.enabled.checked }));
els.fetchPreview.addEventListener('change', () => save({ fetchPreview: els.fetchPreview.checked }));
els.allowScreenshots.addEventListener('change', () => save({ allowScreenshots: els.allowScreenshots.value }));
els.showDomainInfo.addEventListener('change', () => save({ showDomainInfo: els.showDomainInfo.checked }));
els.reset.addEventListener('click', (e) => {
  e.preventDefault();
  save(DEFAULTS);
  apply(DEFAULTS);
});
els.clearMemory.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.storage.local.set({ [RENDER_MEMORY_KEY]: {} }, () => {
    els.memoryCount.textContent = '0 hosts';
  });
});
