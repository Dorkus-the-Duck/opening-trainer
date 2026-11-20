// Persistent user data, saved as JSON in Electron's userData folder via the preload bridge.
const DEFAULT = {
  version: 1,
  cards: {},          // "variationId|w" -> SRS card
  notes: {},          // fenKey -> { text, updated, startFen, line }
  studies: [],        // saved explore trees
  custom: [],         // user-made variations
  customOpenings: [], // user-made opening groups
  settings: { engineInSessions: false, engineDepth: 16, engineSkill: 20, homeSide: 'w', pieces: 'norse', board: 'norse' },
};

let saveTimer = null;

export const store = {
  data: structuredClone(DEFAULT),
  async load() {
    const loaded = await window.api.loadData();
    if (loaded) {
      this.data = { ...structuredClone(DEFAULT), ...loaded, settings: { ...DEFAULT.settings, ...(loaded.settings || {}) } };
      // Older versions had a single "theme" setting.
      const s = this.data.settings;
      if (s.theme === 'classic' && !loaded.settings.pieces) { s.pieces = 'classic'; s.board = 'brown'; }
      delete s.theme;
    }
  },
  save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => window.api.saveData(this.data), 300);
  },
};
