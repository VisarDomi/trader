import { defineAgent } from '../../src/sdk';
import reference from './reference';

// User-requested, prospectively frozen cohort: frequency, leverage and loss-limit contrasts.
// The inspected historical grid selected these; it is not independent validation.
export default defineAgent({
  ...reference,
  name: 'Visar night',
  description: 'US500 night cohort: frozen original clock, calendar and execution; compare day-path strictness, leverage and per-trade loss limits. Each variant is a user-requested demo experiment.',
  author: 'Visar / platform research',
  leverage: [20],
  variants: {
    "broad-1x": {
        "maxRetraceShare": 0.5,
        "lossPct": 40
    },
    "broad-5x": {
        "maxRetraceShare": 0.5,
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
    "body-5x": {
        "minBodyShare": 0.8,
        "lossPct": 20
    },
    "body-20x": {
        "minBodyShare": 0.8,
        "lossPct": 20
    },
    "body-tight-100x": {
        "minBodyShare": 0.8,
        "lossPct": 10
    },
    "retrace-100x": {
        "maxRetraceShare": 0.35,
        "lossPct": 10
    },
    "clean-50x": {
        "minEfficiency": 0.6,
        "lossPct": 40
    }
},
});
