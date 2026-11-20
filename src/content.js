// The active line pack: the one bundled with the app, or a newer one downloaded online.
import { BUNDLED_PACK } from './data/openings.js';

let active = BUNDLED_PACK;

export const content = {
  get pack() { return active; },
  get openings() { return active.openings; },
  get version() { return active.version; },
  get bundledVersion() { return BUNDLED_PACK.version; },
  // Accepts a pack only if it is newer than the bundled one and looks well-formed.
  use(pack) {
    if (pack && Array.isArray(pack.openings) && pack.version > BUNDLED_PACK.version) { active = pack; return true; }
    return false;
  },
};
