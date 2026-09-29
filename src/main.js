import { createStandaloneApplication } from './standalone/application.js';
import { describeError } from './standalone/errors.js';
import { claimEntryAddress } from './ui/nepal/mount.js';

/*
 * Natural Disaster Intelligence, Case 001, is what `/` opens. Decided here,
 * from the address the visitor arrived at, before anything reads that address.
 * `#/workspace` is the one way into the inherited workspace.
 */
const entry = claimEntryAddress();

const application = createStandaloneApplication({
  entry,
  googleApiKey: import.meta.env.GOOGLE_MAPS_API_KEY,
  cesiumToken: import.meta.env.CESIUM_ION_TOKEN,
  allowQaRegistration: import.meta.env.DEV,
});

application.start().catch((error) => {
  console.error('Natural Disaster Intelligence failed to start:', error);
  const loaderStatus = document.querySelector('#loading-screen .loader-status');
  loaderStatus.textContent = `Error: ${describeError(error)}`;
  loaderStatus.style.color = '#ff4444';
});

export { application };
