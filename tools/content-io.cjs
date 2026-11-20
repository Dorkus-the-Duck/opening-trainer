// Reading, writing and merging the line pack (content/openings.json) and line proposals
// (content/proposals/*.json). Used by the app's Proposals screen and by the CLI tools.
//
// A proposal file looks like:
// {
//   "opening": "caro-kann",                 // id of the opening the line belongs to
//   "newOpening": { id, name, eco, moves, blurb, overview: [], plans: {w, b} },  // optional: adds a new opening
//   "variation": { id, name, summary, plans: {w, b}, sides, moves: [[san, why], ...] },
//   "notes": "what changed and how it was checked",   // shown to the reviewer
//   "review": { "status": "pending" | "changes" | "rejected", "note": "...", "at": "ISO date" }
// }
// If variation.id already exists in the pack, approving the proposal replaces that line.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PACK_FILE = path.join(root, 'content', 'openings.json');
const PROPOSALS_DIR = path.join(root, 'content', 'proposals');

// One [san, why] pair per line keeps diffs and reviews readable.
function formatJson(obj) {
  return JSON.stringify(obj, null, 2).replace(/\[\n\s+("[^"\n]*"),\n\s+("(?:[^"\\]|\\.)*")\n\s+\]/g, '[$1, $2]') + '\n';
}

function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, formatJson(obj));
  fs.renameSync(tmp, file);
}

const readPack = () => JSON.parse(fs.readFileSync(PACK_FILE, 'utf8'));

function listProposals() {
  if (!fs.existsSync(PROPOSALS_DIR)) return [];
  return fs.readdirSync(PROPOSALS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((file) => {
      try { return { file, ...JSON.parse(fs.readFileSync(path.join(PROPOSALS_DIR, file), 'utf8')) }; }
      catch (e) { return { file, error: String(e.message) }; }
    });
}

function proposalPath(file) {
  const p = path.join(PROPOSALS_DIR, path.basename(file));
  if (!fs.existsSync(p)) throw new Error('No such proposal: ' + file);
  return p;
}

function setReview(file, status, note) {
  const p = proposalPath(file);
  const prop = JSON.parse(fs.readFileSync(p, 'utf8'));
  prop.review = { status, note: note || '', at: new Date().toISOString() };
  writeJson(p, prop);
  return prop;
}

// Merges a proposal into the pack, bumps the pack version and removes the proposal file.
function approve(file) {
  const p = proposalPath(file);
  const prop = JSON.parse(fs.readFileSync(p, 'utf8'));
  const pack = readPack();
  if (prop.newOpening && !pack.openings.some((o) => o.id === prop.newOpening.id)) {
    pack.openings.push({ overview: [], plans: {}, ...prop.newOpening, variations: [] });
  }
  const openingId = prop.newOpening?.id || prop.opening;
  const opening = pack.openings.find((o) => o.id === openingId);
  if (!opening) throw new Error('Unknown opening: ' + openingId);
  for (const o of pack.openings) o.variations = o.variations.filter((v) => v.id !== prop.variation.id || o === opening);
  const i = opening.variations.findIndex((v) => v.id === prop.variation.id);
  if (i >= 0) opening.variations[i] = prop.variation;
  else opening.variations.push(prop.variation);
  pack.version += 1;
  pack.updated = new Date().toISOString().slice(0, 10);
  writeJson(PACK_FILE, pack);
  fs.unlinkSync(p);
  return pack;
}

module.exports = { PACK_FILE, PROPOSALS_DIR, formatJson, writeJson, readPack, listProposals, setReview, approve };
