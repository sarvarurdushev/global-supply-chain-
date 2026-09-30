/**
 * The official facility vocabulary, and the tiers the access analysis uses.
 *
 * The DoHS/WHO list types facilities by the Nepali public health system's
 * own levels: central, zonal and district hospitals, primary health centres,
 * health posts and sub health posts, plus offices and stores that treat
 * nobody. The TIER is what matters to access: a road to a sub health post is
 * not a road to surgery. Tiers are assigned from the published type alone —
 * no capacity is implied by them and none is claimed.
 */

export const FacilityTier = Object.freeze({
  HOSPITAL: 'HOSPITAL',
  PRIMARY: 'PRIMARY',
  HEALTH_POST: 'HEALTH_POST',
  NON_CLINICAL: 'NON_CLINICAL',
});

const TYPES = Object.freeze({
  'Central Hospital': FacilityTier.HOSPITAL,
  'Zonal Hospital': FacilityTier.HOSPITAL,
  Hospital: FacilityTier.HOSPITAL,
  'Private Hospital': FacilityTier.HOSPITAL,
  'Primary Health Center': FacilityTier.PRIMARY,
  'Primary Health Post': FacilityTier.PRIMARY,
  'Health Center': FacilityTier.PRIMARY,
  'Health Care Center': FacilityTier.PRIMARY,
  'Refugee Camp': FacilityTier.PRIMARY,
  'Health Post': FacilityTier.HEALTH_POST,
  'Sub Health Post': FacilityTier.HEALTH_POST,
  'Sub Center': FacilityTier.HEALTH_POST,
  'Ayurvedic Aushadhalaya': FacilityTier.HEALTH_POST,
  'District Ayurvedic HC': FacilityTier.HEALTH_POST,
  DPHO: FacilityTier.NON_CLINICAL,
  'D(P)HO': FacilityTier.NON_CLINICAL,
  'District Cold Room': FacilityTier.NON_CLINICAL,
  'Supply Center': FacilityTier.NON_CLINICAL,
  'District Center': FacilityTier.NON_CLINICAL,
  DAHC: FacilityTier.NON_CLINICAL,
  RMS: FacilityTier.NON_CLINICAL,
});

/** Misspellings that occur in the published file, read as what they mean. */
const REPAIRS = Object.freeze({
  'DIstrict Cold Room': 'District Cold Room',
  'Distict Cold Room': 'District Cold Room',
});

/**
 * @returns {{ok:true, type:string, tier:string, repairedFrom?:string} | {ok:false, issue:'missing'|'unknown'}}
 */
export function normaliseFacilityType(value) {
  const raw = String(value ?? '').trim();
  if (!raw || /^null$/i.test(raw)) return { ok: false, issue: 'missing' };
  const repaired = REPAIRS[raw];
  const type = repaired ?? raw;
  const tier = TYPES[type];
  if (!tier) return { ok: false, issue: 'unknown' };
  return repaired
    ? { ok: true, type, tier, repairedFrom: raw }
    : { ok: true, type, tier };
}
