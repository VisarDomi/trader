import { defineAgent } from '../../src/sdk';
import reference from './reference';

// Separate Nasdaq cohort; never changes the original US500 source or history.
export default defineAgent({
  ...reference,
  name: 'Visar Nasdaq night',
  description: 'US100 overnight research: frozen NY session/03:27 pullback/08:27 exit, compare step consistency and risk with three low-exposure classifier references. User-requested demo experiments, selected on inspected history.',
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
    "baseline-1x": {
        "lossPct": 40
    },
    "broad-5x": {
        "maxRetraceShare": 0.5,
        "lossPct": 20
    },
    "body-5x": {
        "minBodyShare": 0.8,
        "lossPct": 20
    },
    "steps-1x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 20
    },
    "steps-3x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 20
    },
    "steps-10x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 10
    },
    "steps-20x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 20
    },
    "steps-tight-20x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 5
    },
    "steps-tight-50x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 5
    },
    "steps-tight-100x": {
        "minDirectionalShare": 0.6153846153846154,
        "lossPct": 10
    }
},
});
