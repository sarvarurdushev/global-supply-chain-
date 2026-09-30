/**
 * The briefing, in order. The storyboard (docs/NEPAL_2015_STAGE_9_STORYBOARD.md)
 * numbers forty scenes; the scenes built so far are listed here, and each
 * keeps its storyboard number so the run reads in the storyboard's order.
 */

import { ACT1 } from './act1.js';
import { ACT2 } from './act2.js';
import { ACT3 } from './act3.js';
import { ACT4 } from './act4.js';
import { ACT5 } from './act5.js';
import { ACT6 } from './act6.js';

export const ACT_TITLES = Object.freeze({
  I: 'ACT I · INCIDENT DETECTION',
  II: 'ACT II · WHO AND WHAT WAS IN THE HAZARD',
  III: 'ACT III · PHYSICAL DAMAGE',
  IV: 'ACT IV · INFRASTRUCTURE FAILURE',
  V: 'ACT V · HEALTHCARE AND RESCUE ACCESS',
  VI: 'ACT VI · SYNTHESIS',
});

export const BRIEFING_SCENES = Object.freeze(
  [...ACT1, ...ACT2, ...ACT3, ...ACT4, ...ACT5, ...ACT6].sort(
    (a, b) => a.number - b.number,
  ),
);
