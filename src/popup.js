// Popup settings for LinkScope.

const DEFAULTS = {
  enabled: true,
  mode: 'delay',
  delayMs: 500,
  fetchPreview: true,
};

const RENDER_MEMORY_KEY = 'renderMemory';

const els = {
  enabled: document.getElementById('enabled'),
  mode: document.getElementById('mode'),
  delayMs: document.getElementById('delayMs'),
  delayValue: document.getElementById('delayValue'),
  fetchPreview: document.getElementById('fetchPreview'),
  reset: document.getElementById('reset'),
  clearMemory: document.getElementById('clearMemory'),
  memoryCount: document.getElementById('memoryCount'),
};

function apply(settings) {
  els.enabled.checked = settings.enabled;
  els.mode.value = settings.mode;
  els.delayMs.value = settings.delayMs;
  els.delayValue.textContent = settings.delayMs;
  els.fetchPreview.checked = settings.fetchPreview;
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
els.mode.addEventListener('change', () => save({ mode: els.mode.value }));
els.fetchPreview.addEventListener('change', () => save({ fetchPreview: els.fetchPreview.checked }));
els.delayMs.addEventListener('input', () => {
  els.delayValue.textContent = els.delayMs.value;
  save({ delayMs: Number(els.delayMs.value) });
});
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
