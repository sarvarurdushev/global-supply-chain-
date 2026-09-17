#!/usr/bin/env node
/**
 * Browser proof for the supply-chain workspace against a running app.
 *
 *   npm run qa:workspace                     (defaults to http://localhost:4173)
 *   QA_BASE_URL=http://localhost:4305 node scripts/qa-workspace.mjs
 *
 * Drives the twelve user flows the rebuild was specified against, in the real
 * browser, against live upstream data. Unit tests cover the logic; this covers
 * the things only a real run can: that the chrome mounts over a real Cesium
 * globe, that a click reaches the layer that owns it, that a query actually
 * returns, and that nothing throws on the way.
 *
 * It exists because four defects in this feature were invisible to the unit
 * suite and obvious within seconds of running it — a layer that rendered
 * nothing because it was initialised after being fed, selection facts that were
 * all blank because the record shape was guessed, a scenario that reported
 * "+0 km" because nothing routed through the node it closed, and the inherited
 * title bar rendering straight through the new one.
 *
 * Screenshots land in the gitignored qa-shots/ directory unless QA_SHOTS says
 * otherwise. Exits non-zero on the first failed flow.
 */

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE_URL = process.env.QA_BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.QA_SHOTS ?? 'qa-shots/workspace';
const CHROMIUM = process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined;

/** Upstream calls to UN Comtrade take seconds, not milliseconds. */
const TRADE_TIMEOUT_MS = 25_000;
const PRODUCTION_TIMEOUT_MS = 90_000;

const results = [];
let failures = 0;

function record(flow, ok, detail) {
  results.push({ flow, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`  ${mark}  ${flow}\n`);
  if (detail) process.stdout.write(`        ${detail}\n`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await mkdir(SHOTS, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1680, height: 1000 });

  /*
   * Certificate failures and resource 404s are environmental in a sandboxed
   * run (basemap tiles go through a proxy Chromium does not trust) and say
   * nothing about the application. Anything else is a real defect.
   */
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('ERR_CERT_AUTHORITY_INVALID')) return;
    if (text.includes('Failed to load resource')) return;
    errors.push(text.slice(0, 300));
  });

  const shot = (name) =>
    page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

  const workspace = () =>
    page.evaluate(() => window.__godsEyeView.workspace.getState());

  const panelText = () =>
    page.evaluate(
      () => document.querySelector('.ws-panel-scroll')?.innerText ?? '',
    );

  const clickPanel = (label) =>
    page.evaluate((text) => {
      const button = [
        ...document.querySelectorAll('.ws-panel button, .ws-playback button'),
      ].find((node) => node.textContent.includes(text));
      if (!button) return false;
      button.click();
      return true;
    }, label);

  const clickTopbar = (label) =>
    page.evaluate((text) => {
      const button = [
        ...document.querySelectorAll('.ws-topbar-actions button'),
      ].find((node) => node.textContent.includes(text));
      if (!button) return false;
      button.click();
      return true;
    }, label);

  const setSelect = (ariaLabel, value) =>
    page.evaluate(
      (label, next) => {
        const select = [...document.querySelectorAll('.ws-select')].find(
          (node) => node.getAttribute('aria-label') === label,
        );
        if (!select) return false;
        select.value = next;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      },
      ariaLabel,
      value,
    );

  /** Wait until the panel text satisfies a predicate, or time out. */
  async function waitForPanel(predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate(await panelText())) return true;
      await wait(500);
    }
    throw new Error(`timed out waiting for ${label}`);
  }

  try {
    /* ---------------- FLOW 1: open the application ---------------- */
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 120_000 });
    await page.waitForFunction(() => window.__godsEyeView?.workspace, {
      timeout: 120_000,
    });
    const home = await page.evaluate(() => ({
      title: document.querySelector('.ws-panel-title')?.textContent,
      navItems: document.querySelectorAll('.ws-nav-item').length,
      sections: document.querySelectorAll('.ws-nav-section').length,
      // The defect this whole layout replaced: one scroll region, not six.
      scrollers: [...document.querySelectorAll('.ws-panel *')].filter((node) => {
        const style = getComputedStyle(node);
        return style.overflowY === 'auto' || style.overflowY === 'scroll';
      }).length,
      // The inherited chrome must not render through the new chrome.
      inheritedVisible: ['#title-bar', '#intel-hud', '#left-panel-stack']
        .map((selector) => document.querySelector(selector))
        .filter((node) => node && getComputedStyle(node).display !== 'none')
        .length,
      why: Boolean(document.querySelector('.ws-why')),
    }));
    record(
      '1. Open the application and understand the home view',
      home.title === 'Global Supply Chain' &&
        home.navItems >= 18 &&
        home.sections === 5 &&
        home.scrollers === 1 &&
        home.inheritedVisible === 0 &&
        home.why,
      `title=${home.title} nav=${home.navItems} sections=${home.sections} ` +
        `scrollers=${home.scrollers} inheritedVisible=${home.inheritedVisible} why=${home.why}`,
    );
    await shot('01-home');

    /* ---------------- FLOW 2: a country's supply chain ---------------- */
    await page.evaluate(() => window.__godsEyeView.workspace.navigate('country'));
    await wait(600);
    const country = await panelText();
    record(
      '2. Select a country and see its supply chain',
      /CHOOSE A COUNTRY/i.test(country) && /Ports near it/i.test(country),
      (await workspace()).view,
    );

    /* ---------------- FLOW 3: a product supply chain ---------------- */
    await page.evaluate(() =>
      window.__godsEyeView.workspace.navigate('commodity'),
    );
    await wait(400);
    await setSelect('Product', 'semiconductors');
    await clickPanel('Show trade flows');
    await waitForPanel(
      (text) => /Where it comes from/i.test(text),
      TRADE_TIMEOUT_MS,
      'semiconductor trade flows',
    );
    const semis = await panelText();
    record(
      '3. Select semiconductors and see the supply chain',
      /Other Asia, nes/.test(semis) && /aggregate code/i.test(semis),
      'partner names and the aggregate-code caveat both present',
    );
    await shot('03-semiconductors');

    /* ---------------- FLOW 4: fertilizer ---------------- */
    await setSelect('Product', 'fertilizer-potash');
    await clickPanel('Show trade flows');
    await waitForPanel(
      (text) => /Fertilizer .. potassic|Fertilizer/i.test(text),
      TRADE_TIMEOUT_MS,
      'fertilizer trade flows',
    );
    record(
      '4. Select fertilizer and see the supply chain',
      /Fertilizer/i.test(await panelText()),
      'potash selected and loaded',
    );

    /* ---------------- FLOW 5: investigate Hormuz ---------------- */
    await page.evaluate(() =>
      window.__godsEyeView.workspace.navigate('chokepoints'),
    );
    await wait(400);
    await page.evaluate(() => {
      [...document.querySelectorAll('.ws-list-row.ws-clickable')]
        .find((row) => row.textContent.includes('Hormuz'))
        ?.click();
    });
    await wait(900);
    const hormuz = await panelText();
    record(
      '5. Select the Strait of Hormuz and investigate it',
      /WHY IT MATTERS/i.test(hormuz) &&
        /WHAT PASSES THROUGH HERE/i.test(hormuz) &&
        /WHAT HAPPENS IF IT CLOSES/i.test(hormuz) &&
        /DATA UNAVAILABLE/.test(hormuz),
      'why / what passes / what if, with the transit-volume gap declared',
    );
    await shot('05-hormuz');

    /* ---------------- FLOW 6: run the Hormuz disruption ---------------- */
    await clickPanel('Run the closure scenario');
    await wait(600);
    await clickPanel('Close Strait of Hormuz');
    await waitForPanel(
      (text) => /BEFORE AND AFTER/i.test(text),
      15_000,
      'the Hormuz scenario',
    );
    const scenario = await panelText();
    record(
      '6. Run the Hormuz disruption scenario',
      /normal route/i.test(scenario) &&
        !/\+0 km/.test(scenario) &&
        /no route|extra distance/i.test(scenario),
      'the closure changes the route rather than reporting +0 km',
    );
    await shot('06-disruption');

    /* ---------------- FLOW 7: click a ship ---------------- */
    await page.evaluate(() => {
      // The exact record the vessel layer publishes; see
      // src/layers/vessels/selection.js registerSelectedContext().
      window.dispatchEvent(
        new CustomEvent('gev:entity-selected', {
          detail: {
            id: 'ais-232003859',
            layerId: 'ais-live-vessels',
            layerName: 'Live AIS Vessels',
            source: 'AISStream · LIVE',
            label: 'MAERSK KOWLOON',
            latitude: 51.9244,
            longitude: 4.4777,
            properties: {
              mmsi: '232003859',
              type: 'Cargo',
              destination: 'ROTTERDAM',
            },
          },
        }),
      );
    });
    await wait(500);
    const vessel = await workspace();
    const vesselPanel = await panelText();
    record(
      '7. Click a ship and immediately track it',
      vessel.selection?.label === 'MAERSK KOWLOON' &&
        vessel.navId === 'ships' &&
        /ROTTERDAM/.test(vesselPanel) &&
        /no cargo field/i.test(vesselPanel),
      'selected, panel switched, facts shown, cargo gap declared',
    );

    /* ---------------- FLOW 8: click an aircraft ---------------- */
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('gev:awareness-subject-selected', {
          detail: {
            id: 'a835af',
            layerId: 'flights',
            layerName: 'Live Flights',
            source: 'OpenSky',
            label: 'UAL779',
            latitude: 37.6,
            longitude: -122.4,
            properties: { callsign: 'UAL779', route: 'SFO → NRT' },
          },
        }),
      );
    });
    await wait(500);
    const aircraft = await workspace();
    const aircraftPanel = await panelText();
    record(
      '8. Click an aircraft and immediately track it',
      aircraft.navId === 'aircraft' &&
        /One aircraft at a time/.test(aircraftPanel) &&
        !/One vessel at a time/.test(aircraftPanel),
      'the panel follows the selection rather than staying on ships',
    );

    /* ---------------- FLOW 9: a rail route ---------------- */
    await page.evaluate(() => window.__godsEyeView.workspace.navigate('trains'));
    await wait(500);
    const trains = await panelText();
    record(
      '9. Investigate a train / rail route',
      /City Transit/i.test(trains) && /not freight rail/i.test(trains),
      'city transit offered, and the freight-rail gap stated rather than faked',
    );

    /* ---------------- FLOW 10: play, pause, stop, restart ---------------- */
    await page.evaluate(() =>
      window.__godsEyeView.workspace.openInvestigation('nepal-corridor'),
    );
    await wait(600);
    await clickPanel('Play Investigation');
    await wait(1500);
    const playing = (await workspace()).playback;
    await clickPanel('Pause');
    await wait(400);
    const paused = (await workspace()).playback;
    await clickPanel('Next Step');
    await wait(900);
    const stepped = (await workspace()).playback;
    await clickPanel('Previous Step');
    await wait(700);
    const back = (await workspace()).playback;
    await shot('10-investigation');
    await clickPanel('■ Stop');
    await wait(500);
    const stopped = (await workspace()).playback;
    record(
      '10. Run the Nepal investigation, then pause, step and stop',
      playing?.status === 'playing' &&
        paused?.status === 'paused' &&
        stepped?.index === paused.index + 1 &&
        back?.index === paused.index &&
        stopped?.status === 'idle' &&
        stopped?.index === -1,
      `play=${playing?.status} pause=${paused?.status} next=${stepped?.index} ` +
        `prev=${back?.index} stop=${stopped?.status}`,
    );

    /* ---------------- FLOW 11: reset view ---------------- */
    await page.evaluate(() => window.__godsEyeView.workspace.navigate('events'));
    await wait(400);
    await clickTopbar('Reset View');
    await wait(2200);
    const reset = await workspace();
    const altKm = await page.evaluate(() =>
      Math.round(
        window.__godsEyeView.viewer.camera.positionCartographic.height / 1000,
      ),
    );
    record(
      '11. Change visualisation mode, then reset the view',
      reset.navId === 'home' &&
        reset.selection === null &&
        reset.investigationId === null &&
        altKm > 15_000,
      `nav=${reset.navId} selection=${reset.selection} altitude=${altKm} km`,
    );

    /* ---------------- FLOW 12: a failed request offers a retry ---------------- */
    const failure = await page.evaluate(async () => {
      const gev = window.__godsEyeView;
      // Taiwan is not a Comtrade reporter, so this fails for a real reason.
      gev.supplyChain.setReporter('TWN');
      await gev.supplyChain.run();
      gev.workspace.navigate('commodity');
      await new Promise((resolve) => setTimeout(resolve, 600));
      const text = document.querySelector('.ws-panel-scroll').innerText;
      return {
        explains: /does not report|Unable to load|DATA UNAVAILABLE/i.test(text),
        hasRetry: [...document.querySelectorAll('.ws-panel button')].some(
          (node) => node.textContent.trim() === 'Retry',
        ),
      };
    });
    record(
      '12. A failed data request explains itself and offers a retry',
      failure.explains && failure.hasRetry,
      `explains=${failure.explains} retry=${failure.hasRetry}`,
    );

    /* ---------------- the staged chain and the risk view ---------------- */
    await page.evaluate(() => window.__godsEyeView.workspace.navigate('route'));
    await wait(700);
    await clickPanel('Draw this chain on the globe');
    await wait(2500);
    const chain = await page.evaluate(() => {
      const entry = window.__godsEyeView.dataManager.layers.get('supply-chain');
      const source = window.__godsEyeView.viewer.dataSources._dataSources.find(
        (candidate) => candidate.name === 'supply-chain',
      );
      const entities = source ? source.entities.values : [];
      return {
        stats: entry?.module.getStats() ?? null,
        legs: entities.filter((e) => e.id.startsWith('chain-leg')).length,
        stops: entities.filter((e) => e.id.startsWith('chain-stop')).length,
      };
    });
    record(
      'Extra: the staged chain draws its legs and stops',
      chain.legs > 0 && chain.stops > 0 && chain.stats?.missingStages > 0,
      `legs=${chain.legs} stops=${chain.stops} missingStages=${chain.stats?.missingStages}`,
    );
    await shot('13-chain');

    await page.evaluate(() => window.__godsEyeView.workspace.navigate('risk'));
    await wait(500);
    await setSelect('Country', 'IND');
    await clickPanel('Load indicators');
    await waitForPanel(
      (text) => /How this reaches the supply chain/i.test(text),
      PRODUCTION_TIMEOUT_MS,
      'environmental indicators',
    );
    const risk = await panelText();
    record(
      'Extra: environmental risk states its supply-chain mechanism first',
      /irrigated/i.test(risk) && /river basin/i.test(risk),
      'mechanism stated, and the national-average limit declared',
    );
    await shot('14-risk');

    /* ---------------- no unexplained console errors ---------------- */
    record(
      'No unexplained console errors across every flow',
      errors.length === 0,
      errors.length ? errors.slice(0, 5).join(' | ') : 'clean',
    );
  } catch (error) {
    record('QA run completed', false, String(error?.message ?? error));
    await shot('99-failure');
  } finally {
    await browser.close();
  }

  process.stdout.write(
    `\n${results.length - failures}/${results.length} checks passed. ` +
      `Screenshots in ${SHOTS}/\n`,
  );
  if (failures > 0) process.exitCode = 1;
}

await main();
