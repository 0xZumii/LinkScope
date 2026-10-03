// Popup settings for Link Preview Sandbox.

const DEFAULTS = {
  enabled: true,
  mode: 'shift',
  delayMs: 600,
  fetchPreview: true,
};

const els = {
  enabled: document.getElementById('enabled'),
  mode: document.getElementById('mode'),
  delayMs: document.getElementById('delayMs'),
  delayValue: document.getElementById('delayValue'),
  fetchPreview: document.getElementById('fetchPreview'),
  reset: document.getElementById('reset'),
};

function apply(settings) {
  els.enabled.checked = settings.enabled;
  els.mode.value = settings.mode;
  els.delayMs.value = settings.delayMs;
  els.delayValue.textContent = settings.delayMs;
  els.fetchPreview.checked = settings.fetchPreview;
}

function save(patch) {
  chrome.storage.sync.set(patch);
}

chrome.storage.sync.get(DEFAULTS, (stored) => apply({ ...DEFAULTS, ...stored }));

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
