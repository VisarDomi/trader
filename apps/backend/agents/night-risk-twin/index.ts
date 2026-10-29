import { defineAgent } from '../../src/sdk';
import reference from './reference';

/** Frozen original signals; margin and loss budget both scale 100× down. */
export default defineAgent({
  ...reference,
  name:'Visar night · small-risk twin',
  description:'Frozen night signals and deadline, with 0.5% planned capital loss and about 1.8× initial exposure at tier 1:3. Separate normal-gate research; no special demo admission.',
  author:'Visar / platform research',
  leverage:[3],
  params:{...reference.params,marginPct:60,lossPct:0.5},
});
