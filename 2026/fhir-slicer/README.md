# fhir-slicer

Compile FHIR profile [slicing](https://hl7.org/fhir/profiling.html#slicing) rules
into ShEx shapes over RDF first/rest collections.

A sliced repeating element (e.g. `Observation.component` in the blood-pressure
profile) appears in FHIR RDF as a list. Slicing rules — "one component whose
`code` is systolic, one whose `code` is diastolic, others allowed" — become a
finite state machine walked down that list:

- each **state** records how many members of each slice have been seen;
- each state's shape has one alternative (`|`) per slice that may still match,
  plus (for *open* slicing) a catch-all whose `fhir:first` matches **no**
  discriminator and whose `fhir:rest` stays in the same state;
- every `fhir:rest` points at the successor state's shape;
- `[rdf:nil] OR …` marks accepting states, where every slice's `min` is met.

A `patternCodeableConcept` discriminator is itself the degenerate case — "the
`fhir:coding` list includes this Coding" is a one-slice slicing with min 1,
max \* — so the same machinery generates those shapes too.

## Use

Open `index.html` in a browser (or append `#example` to auto-load the first
example). Paste a `StructureDefinition` differential — or pick one from the
examples menu, which is populated from `examples/manifest.yaml` (override with
a `?manifestURL=…` query parameter). The page shows the extracted slices, the
state machine, and the generated ShExC.

`slicer.js` is dependency-free and also loads in node:

```js
const { generate, BP_EXAMPLE } = require('./slicer.js');
console.log(generate(BP_EXAMPLE).text);
```

## Test

```sh
npm install   # dev-only: @shexjs/parser, to syntax-check the output
npm test
```

## Simplifications

Only the first discriminator of a slicing is used; discriminators are assumed
mutually exclusive (a head matching two slices would need product states);
`ordered` is ignored and `openAtEnd` is treated as `open`; slice constraints
beyond the discriminator are not emitted (a full translation would conjoin
them onto the positive alternatives, leaving the `NOT`s on the
discriminator-only shapes).
