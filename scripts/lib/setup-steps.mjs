// scripts/lib/setup-steps.mjs
//
// Pure argument parsing and step selection for scripts/setup-db.mjs.
//
// Lives in its own module because setup-db.mjs runs main() and builds an AWS
// client on import, so it cannot be loaded by an offline test. Nothing here
// touches the network or the environment.
//
// Why a scoped run exists at all: setup-db.mjs brings EVERY declared table up to
// spec in one go. When some of those indexes must not be created yet (for
// example because the deployed code still writes NULL into their key attribute,
// which makes every write to that table fail once the index exists), the only
// safe way to add an unrelated index is to run just that table's step.

/** Step keys in the order setup-db.mjs executes them. */
export const STEP_KEYS = Object.freeze([
  'organizations',
  'orgUnits',
  'licenses',
  'enrollments',
  'courseSessions',
  'classSummaries',
  'planUpgrades',
  'pointsEscrow',
  'pointTransactions',
  'aiUsageLedger',
  'aiFeatureConfig',
  'costRollups',
  'lessonEvents',
  'lessonSegments',
  'assessments',
  'assessmentSubmissions',
  'gpuJobs',
  'profiles',
  'courses',
]);

function readFlag(argv, name) {
  const prefix = `--${name}=`;
  const hits = argv.filter((a) => a === `--${name}` || a.startsWith(prefix));
  if (hits.length > 1) throw new Error(`--${name} was given more than once`);
  return hits[0];
}

/**
 * `--only=a,b` → ['a', 'b'].  Absent → null (run everything).
 * A bare `--only` or an empty list is an error rather than "run nothing".
 */
export function parseOnlyArg(argv) {
  const hit = readFlag(argv, 'only');
  if (hit === undefined) return null;
  if (hit === '--only') throw new Error('--only needs a value, e.g. --only=courseSessions');
  const names = hit
    .slice('--only='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) throw new Error('--only needs at least one step key, e.g. --only=courseSessions');
  return names;
}

/** `--dry-run` → true. `--dry-run=…` is rejected so a typo cannot silently mean "apply". */
export function parseDryRunArg(argv) {
  const hit = readFlag(argv, 'dry-run');
  if (hit === undefined) return false;
  if (hit !== '--dry-run') throw new Error('--dry-run takes no value');
  return true;
}

/** Any argument that is not one of the flags this script understands. */
export function unknownArgs(argv) {
  return argv.filter((a) => !(a === '--dry-run' || a === '--only' || a.startsWith('--only=')));
}

/**
 * Select steps by key. Keeps declaration order, matches keys case-insensitively,
 * ignores duplicates, and throws on any unknown key (listing the valid ones).
 *
 * @param {string[] | null} only
 * @param {{ key: string, name: string }[]} allSteps
 * @returns {{ selected: typeof allSteps, skipped: typeof allSteps }}
 */
export function selectSteps(only, allSteps) {
  const keys = allSteps.map((s) => s.key);
  const dupKey = keys.find((k, i) => keys.findIndex((x) => x.toLowerCase() === k.toLowerCase()) !== i);
  if (dupKey) throw new Error(`step key "${dupKey}" is declared twice`);

  if (only === null) return { selected: [...allSteps], skipped: [] };

  const wanted = new Set();
  const unknown = [];
  for (const name of only) {
    const step = allSteps.find((s) => s.key.toLowerCase() === String(name).toLowerCase());
    if (step) wanted.add(step.key);
    else unknown.push(name);
  }
  if (unknown.length) {
    throw new Error(
      `unknown step key(s): ${unknown.join(', ')}. Valid keys: ${keys.join(', ')}`
    );
  }
  return {
    selected: allSteps.filter((s) => wanted.has(s.key)),
    skipped: allSteps.filter((s) => !wanted.has(s.key)),
  };
}
