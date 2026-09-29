import { startApplicationChrome } from '../app/startupChrome.js';
import { initKeySetup } from '../keySetup.js';
/*
 * No first-launch chooser in this build. It offered the inherited workspace's
 * missions (live contacts, space, environmental), and on `/` it opened over
 * the product. Its markup is removed rather than left hidden, so nothing can
 * reveal it later; `firstRunExperience.js` itself is untouched.
 */
function retireFirstRun() {
  document.getElementById('first-run-launcher')?.remove();
  return null;
}

export function startStandaloneChrome(options) {
  return startApplicationChrome({
    initializeSettings: initKeySetup,
    initializeWelcome: retireFirstRun,
    ...options,
  });
}
