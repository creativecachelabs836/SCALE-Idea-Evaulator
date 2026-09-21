/**
 * The iteration roadmap, mirrored from SPEC.md so the running application can
 * show where the build has got to.
 *
 * Kept deliberately thin — goals only, not acceptance criteria. The spec is the
 * source of truth; this exists so the landing page cannot silently fall out of
 * date without a test noticing.
 */

export interface Iteration {
  number: number;
  title: string;
  goal: string;
}

export const ITERATIONS: readonly Iteration[] = [
  {
    number: 0,
    title: 'Foundation',
    goal: 'A repository you can clone, launch and test, with the plan written down.',
  },
  {
    number: 1,
    title: 'The evaluation contract',
    goal: 'The canonical data model exists and is provably correct, in isolation.',
  },
  {
    number: 2,
    title: 'See the output',
    goal: 'A full evaluation rendered on screen, from a fixture.',
  },
  {
    number: 3,
    title: 'Intake',
    goal: 'Your idea, your evaluation — the 75-word promise, end to end.',
  },
  {
    number: 4,
    title: 'Real intelligence',
    goal: 'Replace the fixture with actual research and analysis.',
  },
  {
    number: 5,
    title: 'Durability',
    goal: 'Evaluations survive, can be revisited, and long runs do not block.',
  },
  {
    number: 6,
    title: 'The executive report',
    goal: 'The shareable artifact, in the browser and as an 8.5x11 PDF.',
  },
  {
    number: 7,
    title: 'Production',
    goal: 'Something real users can use, at a URL.',
  },
] as const;

/** The iteration currently being built. Bumped as each one completes. */
export const CURRENT_ITERATION = 2;
