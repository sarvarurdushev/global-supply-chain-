/**
 * Commodity registry.
 *
 * Maps the application's commodity selector (§6 of the brief) onto real HS 2022
 * (H6) headings. Every description below is the official HS heading text, taken
 * verbatim from the UN Comtrade H6 reference file — not paraphrased, because a
 * paraphrased commodity definition silently changes what the trade figures mean.
 *
 * A group may map to several headings (copper ore and refined copper are
 * different headings but one commodity story). Summing a group's headings is
 * legitimate; summing across groups is not, because headings overlap in places
 * (e.g. rare earths appear under both 2846 and 2805).
 *
 * GENERATED FILE. Regenerate with `node scripts/build-comtrade-codes.mjs`.
 *
 * Source:  UN Comtrade H6 classification reference, retrieved 2026-09-16
 *          https://comtradeapi.un.org/files/v1/app/reference/H6.json
 * Licence: UN Comtrade terms of use
 *
 * Portable: no Cesium, no Node, no browser globals.
 */

/** Official HS 2022 heading text, keyed by 4-digit heading. */
export const HS_HEADINGS = Object.freeze({
  2709: 'Petroleum oils and oils obtained from bituminous minerals; crude',
  2710: 'Petroleum oils and oils from bituminous minerals, not crude; preparations n.e.c, containing by weight 70% or more of petroleum oils or oils from bituminous minerals; these being the basic constituents of the preparations; waste oils',
  2711: 'Petroleum gases and other gaseous hydrocarbons',
  2701: 'Coal; briquettes, ovoids and similar solid fuels manufactured from coal',
  2601: 'Iron ores and concentrates; including roasted iron pyrites',
  7208: 'Iron or non-alloy steel; flat-rolled products of a width of 600mm or more, hot-rolled, not clad, plated or coated',
  2603: 'Copper ores and concentrates',
  7403: 'Copper; refined and copper alloys, unwrought',
  2818: 'Aluminium oxide (including artificial corundum); aluminium hydroxide',
  7108: 'Gold (including gold plated with platinum) unwrought or in semi-manufactured forms, or in powder form',
  2805: 'Alkali or alkaline-earth metals; rare-earth metals, scandium and yttrium, whether or not intermixed or interalloyed; mercury',
  2846: 'Compounds, inorganic or organic, of rare-earth metals; of yttrium or of scandium or of mixtures of these metals',
  8542: 'Electronic integrated circuits',
  8541: 'Semiconductor devices (e.g. diodes, transistors, semiconductor based transducers); including photovoltaic cells assembled or not in modules or panels, light-emitting diodes (LED) assembled with other LEDs or not, mounted piezo-electric crystals',
  8486: 'Machines and apparatus of a kind used solely or principally for the manufacture of semiconductor boules or wafers, semiconductor devices, electronic integrated circuits or flat panel displays; machines & apparatus specified in note 11 (C) to this Chapter',
  2804: 'Hydrogen, rare gases and other non-metals',
  8471: 'Automatic data processing machines and units thereof, magnetic or optical readers, machines for transcribing data onto data media in coded form and machines for processing such data, not elsewhere specified or included',
  8517: 'Telephone sets, including smartphones and other telephones for cellular/wireless networks; other apparatus for the transmission or reception of voice, images or other data (including wired/wireless networks), excluding items of 8443, 8525, 8527, or 8528',
  8544: 'Insulated wire, cable and other electric conductors, connector fitted or not; optical fibre cables of individually sheathed fibres, whether or not assembled with electric conductors or fitted with connectors',
  8507: 'Electric accumulators, including separators therefor; whether or not rectangular (including square)',
  8703: 'Motor cars and other motor vehicles; principally designed for the transport of persons (other than those of heading no. 8702), including station wagons and racing cars',
  8708: 'Motor vehicles; parts and accessories, of heading no. 8701 to 8705',
  3004: 'Medicaments; (not goods of heading no. 3002, 3005 or 3006) consisting of mixed or unmixed products for therapeutic or prophylactic use, put up in measured doses (incl. those in the form of transdermal admin. systems) or packed for retail sale',
  8479: 'Machinery and mechanical appliances; having individual functions, n.e.c. in this chapter',
  1001: 'Wheat and meslin',
  1005: 'Maize (corn)',
  1201: 'Soya beans, whether or not broken',
  8802: 'Aircraft n.e.c. in heading no. 8801, except unmanned aircraft of heading 8806, (e.g. helicopters, aeroplanes); spacecraft (including satellites) and suborbital and spacecraft launch vehicles',
  8901: 'Cruise ships, excursion boats, ferry-boats, cargo ships, barges and similar vessels for the transport of persons or goods',
});

/** Commodity groups offered by the selector. */
export const COMMODITY_GROUPS = Object.freeze([
  {
    key: 'crude-oil',
    label: 'Crude oil',
    sector: 'ENERGY',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2709']),
  },
  {
    key: 'refined-petroleum',
    label: 'Refined petroleum',
    sector: 'ENERGY',
    stage: 'midstream',
    hsHeadings: Object.freeze(['2710']),
  },
  {
    key: 'lng',
    label: 'LNG and petroleum gases',
    sector: 'ENERGY',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2711']),
  },
  {
    key: 'coal',
    label: 'Coal',
    sector: 'ENERGY',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2701']),
  },
  {
    key: 'iron-ore',
    label: 'Iron ore',
    sector: 'METALS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2601']),
  },
  {
    key: 'steel',
    label: 'Steel (flat-rolled)',
    sector: 'METALS',
    stage: 'midstream',
    hsHeadings: Object.freeze(['7208']),
  },
  {
    key: 'copper',
    label: 'Copper',
    sector: 'METALS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2603', '7403']),
  },
  {
    key: 'aluminium-oxide',
    label: 'Alumina',
    sector: 'METALS',
    stage: 'midstream',
    hsHeadings: Object.freeze(['2818']),
  },
  {
    key: 'gold',
    label: 'Gold',
    sector: 'METALS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['7108']),
  },
  {
    key: 'lithium-and-alkali',
    label: 'Lithium and other alkali metals',
    sector: 'CRITICAL_MINERALS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2805']),
  },
  {
    key: 'rare-earths',
    label: 'Rare-earth compounds',
    sector: 'CRITICAL_MINERALS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2846', '2805']),
  },
  {
    key: 'semiconductors',
    label: 'Semiconductors (integrated circuits)',
    sector: 'ELECTRONICS',
    stage: 'midstream',
    hsHeadings: Object.freeze(['8542']),
  },
  {
    key: 'semiconductor-devices',
    label: 'Semiconductor devices and LEDs',
    sector: 'ELECTRONICS',
    stage: 'midstream',
    hsHeadings: Object.freeze(['8541']),
  },
  {
    key: 'semiconductor-equipment',
    label: 'Semiconductor manufacturing equipment',
    sector: 'ELECTRONICS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['8486']),
  },
  {
    key: 'semiconductor-gases',
    label: 'Industrial and rare gases',
    sector: 'ELECTRONICS',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2804']),
  },
  {
    key: 'computers',
    label: 'Computers and data-processing machines',
    sector: 'ELECTRONICS',
    stage: 'downstream',
    hsHeadings: Object.freeze(['8471']),
  },
  {
    key: 'telecoms',
    label: 'Telephones and communication apparatus',
    sector: 'ELECTRONICS',
    stage: 'downstream',
    hsHeadings: Object.freeze(['8517']),
  },
  {
    key: 'wire-and-cable',
    label: 'Insulated wire and optical fibre cable',
    sector: 'ELECTRONICS',
    stage: 'midstream',
    hsHeadings: Object.freeze(['8544']),
  },
  {
    key: 'batteries',
    label: 'Batteries and accumulators',
    sector: 'ENERGY_TRANSITION',
    stage: 'midstream',
    hsHeadings: Object.freeze(['8507']),
  },
  {
    key: 'automobiles',
    label: 'Motor cars',
    sector: 'AUTOMOTIVE',
    stage: 'downstream',
    hsHeadings: Object.freeze(['8703']),
  },
  {
    key: 'auto-parts',
    label: 'Motor vehicle parts',
    sector: 'AUTOMOTIVE',
    stage: 'midstream',
    hsHeadings: Object.freeze(['8708']),
  },
  {
    key: 'pharmaceuticals',
    label: 'Medicaments',
    sector: 'PHARMA',
    stage: 'downstream',
    hsHeadings: Object.freeze(['3004']),
  },
  {
    key: 'machinery',
    label: 'Machinery with individual functions',
    sector: 'MACHINERY',
    stage: 'midstream',
    hsHeadings: Object.freeze(['8479']),
  },
  /* Fertilizer is three separate supply chains that get discussed as one.
     Nitrogen comes from natural gas, phosphate from mined rock, potash from
     mined salts — a gas-price shock hits the first and leaves the third alone.
     Splitting them by HS heading keeps that distinction visible instead of
     averaging it away into a single "fertilizer" bar. */
  {
    key: 'fertilizer-nitrogen',
    label: 'Fertilizer \u2014 nitrogenous',
    sector: 'AGRICULTURE',
    stage: 'midstream',
    hsHeadings: Object.freeze(['3102']),
  },
  {
    key: 'fertilizer-phosphate',
    label: 'Fertilizer \u2014 phosphatic',
    sector: 'AGRICULTURE',
    stage: 'midstream',
    hsHeadings: Object.freeze(['3103']),
  },
  {
    key: 'fertilizer-potash',
    label: 'Fertilizer \u2014 potassic',
    sector: 'AGRICULTURE',
    stage: 'midstream',
    hsHeadings: Object.freeze(['3104']),
  },
  {
    key: 'fertilizer-mixed',
    label: 'Fertilizer \u2014 mixed (NPK)',
    sector: 'AGRICULTURE',
    stage: 'downstream',
    hsHeadings: Object.freeze(['3105']),
  },
  {
    key: 'natural-gas-feedstock',
    label: 'Ammonia (fertilizer feedstock)',
    sector: 'AGRICULTURE',
    stage: 'upstream',
    hsHeadings: Object.freeze(['2814']),
  },
  {
    key: 'rice',
    label: 'Rice',
    sector: 'AGRICULTURE',
    stage: 'upstream',
    hsHeadings: Object.freeze(['1006']),
  },
  {
    key: 'wheat',
    label: 'Wheat',
    sector: 'AGRICULTURE',
    stage: 'upstream',
    hsHeadings: Object.freeze(['1001']),
  },
  {
    key: 'maize',
    label: 'Maize',
    sector: 'AGRICULTURE',
    stage: 'upstream',
    hsHeadings: Object.freeze(['1005']),
  },
  {
    key: 'soybeans',
    label: 'Soya beans',
    sector: 'AGRICULTURE',
    stage: 'upstream',
    hsHeadings: Object.freeze(['1201']),
  },
  {
    key: 'aircraft',
    label: 'Aircraft and spacecraft',
    sector: 'TRANSPORT_EQUIPMENT',
    stage: 'downstream',
    hsHeadings: Object.freeze(['8802']),
  },
  {
    key: 'ships',
    label: 'Cargo and passenger ships',
    sector: 'TRANSPORT_EQUIPMENT',
    stage: 'downstream',
    hsHeadings: Object.freeze(['8901']),
  },
]);
