// Built-in repertoire, stored as data in content/openings.json so lines can be proposed,
// reviewed and shipped as online updates. Each variation is a list of [san, why] pairs from
// the start position; `sides` lists which colours it can be trained from (default: both).
import pack from '../../content/openings.json' with { type: 'json' };

export const BUNDLED_PACK = pack;
export const OPENINGS = pack.openings;
