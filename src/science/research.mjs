import { createHash } from 'node:crypto';
import { summarize, validate } from '../../ms05-analysis/analysis.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const MEASUREMENTS = Object.freeze({
  initial_droplet_diameter_mm: 'mm', visible_flame_extinction_diameter_mm: 'mm',
  burning_rate_mm_s: 'mm/s', burn_time_s: 's', pressure_mmHg: 'mmHg',
  oxygen_mole_fraction: '1'
});
const validRecord = row => row && typeof row === 'object' && typeof row.id === 'string';

export function compareExperiments(a, b, measurement = 'burning_rate_mm_s') {
  if (!validRecord(a) || !validRecord(b) || !Object.hasOwn(MEASUREMENTS,measurement))
    return { status: 'unsupported', reasons: ['Valid experiment records and a documented measurement are required.'] };
  const reasons = [];
  if (a.id === b.id) reasons.push('Select two distinct experiment identifiers.');
  if (!Number.isFinite(a[measurement]) || !Number.isFinite(b[measurement])) reasons.push('One or both measurements are missing or nonnumeric.');
  for (const key of ['fuel','oxygen_mole_fraction','nitrogen_mole_fraction']) {
    if (a[key] == null || b[key] == null) reasons.push(`${key} metadata missing.`);
    else if (a[key] !== b[key]) reasons.push(`${key} differs between experiments.`);
  }
  if (!Number.isFinite(a.pressure_mmHg) || !Number.isFinite(b.pressure_mmHg)) reasons.push('Pressure metadata missing.');
  if (reasons.length) return { status: 'unsupported', reasons, measurement, unit: MEASUREMENTS[measurement] };
  const pressureDifference = Math.abs(a.pressure_mmHg - b.pressure_mmHg);
  const conditions = { fuel: a.fuel, oxygenFraction: a.oxygen_mole_fraction,
    nitrogenFraction: a.nitrogen_mole_fraction, pressureDifferenceMmHg: pressureDifference };
  return {
    status: 'partial', measurement, unit: MEASUREMENTS[measurement],
    a: { id:a.id, value:a[measurement] }, b: { id:b.id, value:b[measurement] },
    difference: b[measurement] - a[measurement], conditions,
    reasons: [pressureDifference > 0 ? 'Reported pressure differs.' : 'Reported pressure matches.',
      'Instrument calibration, measurement uncertainty and repeat-level equivalence are unavailable. Metadata similarity does not establish experimental equivalence.'],
    evidence: 'COMPUTED from bundled reported values'
  };
}

export function runAnalysis(rows, { variable = 'burning_rate_mm_s', selectedIds = null, datasetId = 'PSI-69-subset', datasetVersion = null, question = '' } = {}) {
  if (!Object.hasOwn(MEASUREMENTS,variable)) throw new Error('Unknown or unsupported measurement.');
  const quality = validate(rows);
  if (!quality.valid) throw new Error(`Invalid input: ${quality.errors.slice(0,3).join('; ')}`);
  if (selectedIds !== null && (!Array.isArray(selectedIds) || selectedIds.some(x=>typeof x !== 'string')))
    throw new Error('selectedIds must be a list of experiment identifiers.');
  const chosen = selectedIds === null ? rows : rows.filter(row=>selectedIds.includes(row.id));
  if (!chosen.length) throw new Error('Selection contains no experiment records.');
  const stats = summarize(chosen).stats[variable];
  if (stats.n===0 || !Number.isFinite(stats.mean) || (stats.sd !== null && !Number.isFinite(stats.sd)))
    throw new Error('Selected computation has no finite result.');
  const input = chosen.map(row=>({id:row.id,value:row[variable] ?? null}));
  const result = { mean:stats.mean, sampleSd:stats.sd, n:stats.n, missing:stats.missing, unit:stats.unit };
  const recipe = { version:2, software:'MORS AEGIS 3.0 scientific core', datasetId, datasetVersion,
    variable, selectedIds:chosen.map(row=>row.id), method:'arithmetic mean; sample SD (n-1); null values excluded',
    questionSha256:hash(question.slice(0,500)), inputSha256:hash(chosen), resultSha256:hash(result) };
  return { question: question.slice(0,500), evidence:'COMPUTED', input, result,
    uncertainty:'Sample SD represents observed spread, not sensor uncertainty.',
    interpretation:'Descriptive for the selected records only.',
    limitations:['Bundled subset is small and selected.','No instrument uncertainty supplied.','No causal or population inference.'],
    recipe };
}

export function replayAnalysis(rows, saved, currentDatasetVersion = null, currentDatasetId = 'PSI-69-subset') {
  if (!saved?.recipe || ![1,2].includes(saved.recipe.version)) throw new Error('Unsupported or missing replay recipe.');
  const {variable,selectedIds,datasetId,datasetVersion,inputSha256,resultSha256} = saved.recipe;
  if (!saved.result || typeof saved.result !== 'object' || Array.isArray(saved.result)) throw new Error('Saved result is missing.');
  const fresh = runAnalysis(rows,{variable,selectedIds,datasetId:currentDatasetId,datasetVersion:currentDatasetVersion,question:saved.question || ''});
  const inputsMatch = fresh.recipe.inputSha256 === inputSha256;
  const savedResultMatches = hash(saved.result) === resultSha256;
  const resultMatches = fresh.recipe.resultSha256 === resultSha256 && savedResultMatches;
  const versionMatches = currentDatasetVersion === null || datasetVersion === currentDatasetVersion;
  const recipeMatches = saved.recipe.version === fresh.recipe.version && datasetId === currentDatasetId &&
    saved.recipe.software === fresh.recipe.software && saved.recipe.method === fresh.recipe.method &&
    JSON.stringify(selectedIds) === JSON.stringify(fresh.recipe.selectedIds);
  const questionMatches = saved.recipe.questionSha256 === fresh.recipe.questionSha256;
  const matches = inputsMatch && resultMatches && versionMatches && recipeMatches && questionMatches;
  return { matches, inputsMatch, resultMatches, savedResultMatches, versionMatches, recipeMatches, questionMatches,
    reason: matches ? 'Input records, dataset identity/version, question and saved/calculated result checksums match.' :
      'Input dataset, dataset identity/version, question, recipe or result differs; legacy recipes lack complete integrity metadata.',
    replayed:fresh, timeline:['Dataset selection','Validation','Null exclusion','Descriptive statistics','Checksum comparison'] };
}

export function inferMeasurement(question) {
  const q = String(question || '').toLowerCase();
  if (/pressure|ضغط/.test(q)) return 'pressure_mmHg';
  if (/oxygen|أكسجين|اوكسجين/.test(q)) return 'oxygen_mole_fraction';
  if (/burn(?:ing)?\s*(?:time|duration)|duration|زمن|مدة/.test(q)) return 'burn_time_s';
  if (/diameter|droplet|قطر|قطرة/.test(q)) return 'initial_droplet_diameter_mm';
  if (/burn(?:ing)?\s*rate|معدل\s*الاحتراق/.test(q)) return 'burning_rate_mm_s';
  return null;
}

export function scientificChallenge(rows, { question, variable = null, selectedIds = null } = {}) {
  if (typeof question !== 'string' || !question.trim() || question.length > 500) throw new Error('A concise scientific question is required.');
  const inferred = inferMeasurement(question);
  const genericScientific = /mean|average|statistic|measurement|flame|combustion|متوسط|قياس|لهب|احتراق/i.test(question);
  if (!inferred && !genericScientific) return { status:'unsupported', reason:'The available FLEX measurements cannot address this question.',
    stages:[{stage:'Question',status:'complete',evidence:question},{stage:'Suitability',status:'unsupported',evidence:'No relevant measurement or investigation identified.'}] };
  const chosenVariable = variable || inferred || 'burning_rate_mm_s';
  const asksComparison = /compare|difference|differ|قارن|فرق|مقارن/i.test(question);
  if (asksComparison && (!Array.isArray(selectedIds) || selectedIds.length !== 2 || selectedIds[0] === selectedIds[1]))
    return { status:'unsupported', reason:'Select two distinct experiment identifiers for a comparison.',
      stages:[{stage:'Question',status:'complete',evidence:question},{stage:'Suitability',status:'unsupported',evidence:'Exactly two distinct experiment identifiers are required.'}] };
  const comparison = asksComparison ? compareExperiments(rows.find(row=>row.id===selectedIds[0]), rows.find(row=>row.id===selectedIds[1]), chosenVariable) : null;
  if (comparison?.status === 'unsupported') return { status:'unsupported', reason:comparison.reasons.join(' '), comparison,
    stages:[{stage:'Question',status:'complete',evidence:question},{stage:'Suitability',status:'unsupported',evidence:comparison.reasons}] };
  const analysis = runAnalysis(rows,{question,variable:chosenVariable,selectedIds});
  return { status:'completed-with-limits', hypothesis:{classification:'HYPOTHESIS',text:`The reported ${chosenVariable} may vary with experimental conditions; this requires a larger controlled dataset.`,supported:false},
    stages:[
      {stage:'Question',status:'complete',evidence:question},
      {stage:'Dataset discovery',status:'complete',evidence:'Bundled PSI-69 five-row extract only'},
      {stage:'Suitability',status:'partial',evidence:'Valid numeric records; no population or controlled sample'},
      {stage:'Analysis',status:'complete',evidence:comparison || analysis.result},
      {stage:'Independent interpretation',status:'limited',evidence:'No independent source-row verification or uncertainty model'},
      {stage:'Evidence review',status:'complete',evidence:analysis.recipe},
    ],analysis, comparison, nextQuestion:'Would a larger stratified dataset preserve the observed descriptive difference?'};
}
