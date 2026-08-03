const assert = require('assert');
const { generate, buildMachine, BP_EXAMPLE } = require('./slicer.js');

const result = generate(BP_EXAMPLE);
console.log(result.text);
console.log('\n---- warnings:', result.warnings.length ? result.warnings : 'none');

// Root shape wiring
assert(result.text.includes('start = @<#BloodPressure>'));
assert(result.text.includes('fhir:component @<#component_SystolicBP_DiastolicBP>'));
assert(result.text.includes('fhir:code @<#CC_loinc_85354_9>'));

// The four states of the component list machine
for (const name of [
  '<#component_SystolicBP_DiastolicBP>',
  '<#component_DiastolicBP_no_SystolicBP>',
  '<#component_SystolicBP_no_DiastolicBP>',
  '<#component_no_SystolicBP_no_DiastolicBP> [rdf:nil] OR',
]) assert(result.text.includes(name), 'missing ' + name);

// Open slicing: the "neither discriminator" alternative self-loops
assert(result.text.includes(
  'fhir:first NOT @<#LI_SystolicBP> AND NOT @<#LI_DiastolicBP> ; fhir:rest @<#component_SystolicBP_DiastolicBP>'));

// Discriminator shapes reuse the list machinery for "coding list includes X"
assert(result.text.includes('<#LI_SystolicBP>'));
assert(result.text.includes('<#codings_loinc_8480_6>'));
assert(result.text.includes('fhir:first @<#Coding_loinc_8480_6> ; fhir:rest @<#AnyList>'));
assert(result.text.includes('<#AnyList> [rdf:nil] OR'));

// Machine sanity: 4 reachable states, one accepting
const m = result.machines[0];
assert.equal(m.states.length, 4);
assert.equal(m.states.filter(s => s.nilOk).length, 1);
assert.equal(m.startKey, '0,0');

// Closed slicing: no NOT alternative, exhausted state is bare [rdf:nil]
const closed = buildMachine([{ name: 'A', min: 1, max: 1 }], 'closed');
assert.equal(closed.get('0').alts.length, 1);
assert.equal(closed.get('1').alts.length, 0);
assert(closed.get('1').nilOk);

// Unbounded slice (min 1, max *) collapses its satisfied state into AnyList
const open = buildMachine([{ name: 'A', min: 1, max: Infinity }], 'open');
assert(open.get('1').universal);

// Every example in the manifest parses and generates
const fs = require('fs');
const manifest = fs.readFileSync(__dirname + '/examples/manifest.yaml', 'utf8');
const files = [...manifest.matchAll(/profileURL:\s*(\S+)/g)].map(m => m[1]);
assert(files.length >= 2, 'manifest should list examples');
for (const f of files) {
  const sd = JSON.parse(fs.readFileSync(__dirname + '/examples/' + f, 'utf8'));
  const r = generate(sd);
  assert(r.machines.length >= 1, f + ' produced no list machine');
  console.log('----', f + ':', r.machines[0].states.length, 'states, rules', r.machines[0].rules);
}

// Optional: parse the generated ShExC with a real parser if available
try {
  const parser = require('@shexjs/parser').construct('http://example.org/');
  const schema = parser.parse(result.text);
  console.log('---- @shexjs/parser: parsed OK,', schema.shapes.length, 'shapes');
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') console.log('---- @shexjs/parser not installed; skipped syntax check');
  else throw e;
}

console.log('---- all assertions passed');
