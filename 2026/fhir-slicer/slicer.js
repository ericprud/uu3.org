/**
 * fhir-slicer — compile FHIR slicing rules into ShEx shapes over RDF collections.
 *
 * A sliced repeating element (e.g. Observation.component) appears in RDF as a
 * first/rest list. Slicing rules ("1 component whose code is systolic, 1 whose
 * code is diastolic, others allowed") become a finite state machine walked down
 * that list: each state records how many members of each slice have been seen,
 * each fhir:rest points at the shape for the successor state, and rdf:nil is
 * only permitted in states where every slice's `min` has been met.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FhirSlicer = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SYSTEM_LABELS = {
    'http://loinc.org': 'loinc',
    'http://snomed.info/sct': 'sct',
    'http://unitsofmeasure.org': 'ucum',
    'http://terminology.hl7.org/CodeSystem/observation-category': 'obscat',
  };

  function sanitize(s) {
    return String(s).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
  }

  function systemLabel(system) {
    if (!system) return 'code';
    if (SYSTEM_LABELS[system]) return SYSTEM_LABELS[system];
    const m = /^[a-z+.-]+:\/\/([^/]+)/i.exec(system);
    if (m) return sanitize(m[1].replace(/^www\./, '').split('.')[0]);
    return sanitize(system);
  }

  function codingLabel(coding) {
    return systemLabel(coding.system) + '_' + sanitize(coding.code || 'any');
  }

  function parseMax(el) {
    if (el.max == null || el.max === '*') return Infinity;
    return parseInt(el.max, 10);
  }

  /** Pull a pattern[x]/fixed[x] discriminating value off an ElementDefinition. */
  function extractPattern(el) {
    if (!el) return null;
    const cc = el.patternCodeableConcept || el.fixedCodeableConcept;
    if (cc && cc.coding && cc.coding.length) return { kind: 'CodeableConcept', codings: cc.coding };
    const c = el.patternCoding || el.fixedCoding;
    if (c) return { kind: 'Coding', codings: [c] };
    return null;
  }

  // ---------------------------------------------------------------- parsing

  function parseProfile(sd) {
    if (!sd || sd.resourceType !== 'StructureDefinition')
      throw new Error('Expected a FHIR StructureDefinition (got ' + (sd && sd.resourceType || 'no resourceType') + ')');
    const elements = (sd.differential && sd.differential.element)
      || (sd.snapshot && sd.snapshot.element);
    if (!elements || !elements.length)
      throw new Error('StructureDefinition has no differential or snapshot elements');

    const resource = sd.type || elements[0].path.split('.')[0];
    const warnings = [];
    const slicings = [];

    for (const el of elements) {
      if (!el.slicing) continue;
      const discs = el.slicing.discriminator || [];
      if (!discs.length) { warnings.push('Slicing on ' + el.path + ' has no discriminator; skipped.'); continue; }
      const disc = discs[0];
      if (discs.length > 1) warnings.push('Only the first discriminator of ' + el.path + ' is used.');
      if (disc.type !== 'pattern' && disc.type !== 'value')
        warnings.push('Discriminator type "' + disc.type + '" on ' + el.path + ' is treated like "pattern".');
      if (el.slicing.ordered) warnings.push('ordered=true on ' + el.path + ' is not modeled; slices may appear in any list order.');
      if (el.slicing.rules === 'openAtEnd') warnings.push('rules=openAtEnd on ' + el.path + ' is treated as open.');
      if (el.path.split('.').length !== 2)
        warnings.push('Slicing at ' + el.path + ' is compiled but not wired into the root shape (only direct children are).');

      const slices = [];
      for (const s of elements) {
        if (s.path !== el.path || !s.sliceName) continue;
        const discId = el.path + ':' + s.sliceName + (disc.path === '$this' ? '' : '.' + disc.path);
        const discEl = disc.path === '$this' ? s : elements.find(e => e.id === discId);
        const pattern = extractPattern(discEl);
        if (!pattern) {
          warnings.push('Slice ' + s.sliceName + ' of ' + el.path + ': no pattern/fixed value found at ' +
            discId + '; slice skipped.');
          continue;
        }
        slices.push({
          name: sanitize(s.sliceName),
          min: s.min || 0,
          max: parseMax(s),
          discPath: disc.path,
          pattern,
        });
      }
      if (!slices.length) { warnings.push('Slicing on ' + el.path + ' has no usable slices; skipped.'); continue; }
      slicings.push({
        path: el.path,
        property: el.path.split('.').pop(),
        rules: el.slicing.rules === 'closed' ? 'closed' : 'open',
        discriminator: disc,
        slices,
      });
    }

    // Direct children of the resource that constrain the root shape.
    const rootConstraints = [];
    for (const el of elements) {
      const segs = el.path.split('.');
      if (segs.length !== 2 || el.sliceName || el.slicing) continue;
      const pattern = extractPattern(el);
      if (pattern && parseMax(el) <= 1) {
        rootConstraints.push({ name: segs[1], min: el.min || 0, pattern });
      } else if (pattern) {
        warnings.push('Pattern on repeating element ' + el.path + ' is not translated (would need its own list shape).');
        rootConstraints.push({ name: segs[1], min: el.min || 0, pattern: null });
      } else if ((el.min || 0) >= 1) {
        rootConstraints.push({ name: segs[1], min: el.min, pattern: null });
      }
    }

    return {
      resource,
      name: sanitize(sd.name || sd.id || 'Profile'),
      rootConstraints,
      slicings,
      warnings,
    };
  }

  // ---------------------------------------------------- the list state machine

  /**
   * States are vectors of per-slice match counts (capped so the space is
   * finite). From each state: one alternative per slice that may still match,
   * plus — for open slicing — a "matches no discriminator" alternative that
   * stays in the same state. rdf:nil is accepted where every min is met.
   */
  function buildMachine(slices, rules) {
    const caps = slices.map(s => isFinite(s.max) ? s.max : s.min);
    const key = c => c.join(',');
    const states = new Map();
    const queue = [slices.map(() => 0)];
    while (queue.length) {
      const c = queue.shift();
      const k = key(c);
      if (states.has(k)) continue;
      const alts = [];
      slices.forEach((s, i) => {
        if (c[i] < s.max) {
          const n = c.slice();
          n[i] = Math.min(n[i] + 1, caps[i]);
          alts.push({ slice: i, next: key(n) });
          queue.push(n);
        }
      });
      const open = rules !== 'closed';
      if (open) alts.push({ slice: null, next: k });
      const nilOk = c.every((ci, i) => ci >= slices[i].min);
      // A state that accepts nil, self-loops on everything, and excludes
      // nothing is just "any well-formed list" — shared as <#AnyList>.
      const universal = open && nilOk
        && alts.every(a => a.next === k)
        && slices.every((s, i) => c[i] < s.max);
      // A state with no alternatives (closed slicing, every slice used up)
      // must end: inlined as the value rdf:nil instead of a named shape.
      const terminal = nilOk && alts.length === 0;
      states.set(k, { key: k, counts: c, nilOk, alts, universal, terminal });
    }
    return states;
  }

  function stateShapeName(base, st, slices) {
    if (st.terminal) return null;
    if (st.universal) return 'AnyList';
    const parts = st.counts.map((c, i) => {
      const s = slices[i];
      if (c < s.min) return { rank: 0, text: s.name };                    // still owed
      if (isFinite(s.max) && c >= s.max) return { rank: 2, text: 'no_' + s.name }; // used up
      return { rank: 1, text: 'opt_' + s.name };                          // satisfied, more allowed
    });
    parts.sort((a, b) => a.rank - b.rank);
    return base + '_' + parts.map(p => p.text).join('_');
  }

  /** Human-readable summary of a state, for diagrams/UI. */
  function stateLabel(st, slices) {
    if (st.terminal) return 'list must end';
    if (st.universal) return 'anything more';
    const needs = [], noMore = [];
    st.counts.forEach((c, i) => {
      if (c < slices[i].min) needs.push(slices[i].name);
      else if (isFinite(slices[i].max) && c >= slices[i].max) noMore.push(slices[i].name);
    });
    if (!needs.length) return 'satisfied — list may end';
    return 'still needs ' + needs.join(' + ');
  }

  function renderMachine(base, slices, states, liRefs) {
    const names = new Map();
    for (const st of states.values()) names.set(st.key, stateShapeName(base, st, slices));
    const decls = [];
    let usesAny = false;
    for (const st of states.values()) {
      if (st.universal) { usesAny = true; continue; }
      if (st.terminal) continue;
      const name = names.get(st.key);
      const altTexts = st.alts.map(a => {
        const nextSt = states.get(a.next);
        if (nextSt.universal) usesAny = true;
        const restRef = nextSt.terminal ? '[rdf:nil]'
          : nextSt.universal ? '@<#AnyList>'
          : '@<#' + names.get(a.next) + '>';
        if (a.slice === null) {
          const nots = liRefs.map(r => 'NOT @' + r).join(' AND ');
          return 'fhir:first ' + nots + ' ; fhir:rest ' + restRef;
        }
        return 'fhir:first @' + liRefs[a.slice] + ' ; fhir:rest ' + restRef;
      });
      let text;
      if (altTexts.length) {
        const body = '{\n    ' + altTexts.join('\n  | ') + '\n}';
        text = st.nilOk
          ? '<#' + name + '> [rdf:nil] OR ' + body
          : '<#' + name + '> ' + body;
      } else {
        text = '<#' + name + '> [rdf:nil]';
      }
      decls.push({ name, text });
    }
    return { decls, names, usesAny };
  }

  // ------------------------------------------------------------- ShEx pieces

  function codingDecl(coding) {
    const name = 'Coding_' + codingLabel(coding);
    const lines = [];
    if (coding.system) lines.push('  fhir:system { fhir:v ["' + coding.system + '"^^xsd:anyURI] }');
    if (coding.code) lines.push('  fhir:code { fhir:v ["' + coding.code + '"] }');
    const comment = coding.display ? '# ' + coding.display + '\n' : '';
    return { name, text: comment + '<#' + name + '> {\n' + lines.join(' ;\n') + '\n}' };
  }

  /**
   * Shape(s) for a pattern[x] CodeableConcept: the coding list must *include*
   * each pattern Coding — itself a (degenerate, min=1 max=*) slicing problem,
   * so it reuses the same state machine.
   */
  function ccShape(pattern, buckets) {
    const labels = pattern.codings.map(codingLabel);
    pattern.codings.forEach(c => addTo(buckets.cc, codingDecl(c)));
    if (pattern.kind === 'Coding') return { ref: '<#Coding_' + labels[0] + '>' };

    const slices = labels.map(l => ({ name: l, min: 1, max: Infinity }));
    const machine = buildMachine(slices, 'open');
    const liRefs = labels.map(l => '<#Coding_' + l + '>');
    const rm = renderMachine('codings', slices, machine, liRefs);
    rm.decls.forEach(d => addTo(buckets.cc, d));
    if (rm.usesAny) buckets.usesAny = true;

    const startName = rm.names.get(machine.keys().next().value);
    const ccName = 'CC_' + labels.join('_');
    addTo(buckets.cc, {
      name: ccName,
      text: '<#' + ccName + '> {\n  fhir:coding @<#' + startName + '>\n}',
    });
    return { ref: '<#' + ccName + '>' };
  }

  /** Wrap a shape ref in nested properties for a dotted discriminator path. */
  function wrapPath(discPath, ref) {
    const segs = discPath.split('.');
    let expr = 'fhir:' + segs[segs.length - 1] + ' @' + ref;
    for (let i = segs.length - 2; i >= 0; i--) {
      expr = 'fhir:' + segs[i] + ' { ' + expr + ' }';
    }
    return expr;
  }

  function addTo(map, decl) {
    if (!map.has(decl.name)) map.set(decl.name, decl.text);
  }

  // ---------------------------------------------------------------- generate

  function generate(sd) {
    const p = parseProfile(sd);
    const buckets = { state: new Map(), li: new Map(), cc: new Map(), usesAny: false };
    const rootTCs = ['a [fhir:' + p.resource + ']'];
    const machines = [];

    for (const rc of p.rootConstraints) {
      if (rc.pattern) rootTCs.push('fhir:' + rc.name + ' @' + ccShape(rc.pattern, buckets).ref);
      else rootTCs.push('fhir:' + rc.name + ' .');
    }

    for (const sl of p.slicings) {
      const liRefs = sl.slices.map(s => {
        const cc = ccShape(s.pattern, buckets);
        if (s.discPath === '$this') return cc.ref;
        const liName = 'LI_' + s.name;
        addTo(buckets.li, {
          name: liName,
          text: '# discriminator test for slice "' + s.name + '"\n<#' + liName + '> {\n  '
            + wrapPath(s.discPath, cc.ref) + '\n}',
        });
        return '<#' + liName + '>';
      });

      const machine = buildMachine(sl.slices, sl.rules);
      const rm = renderMachine(sl.property, sl.slices, machine, liRefs);
      rm.decls.forEach(d => addTo(buckets.state, d));
      if (rm.usesAny) buckets.usesAny = true;

      const startKey = machine.keys().next().value;
      const startRef = machine.get(startKey).terminal
        ? '[rdf:nil]' : '@<#' + rm.names.get(startKey) + '>';
      if (sl.path.split('.').length === 2)
        rootTCs.push('fhir:' + sl.property + ' ' + startRef);

      machines.push({
        path: sl.path,
        property: sl.property,
        rules: sl.rules,
        discriminator: sl.discriminator,
        slices: sl.slices,
        liRefs,
        startKey,
        states: Array.from(machine.values()).map(st => ({
          key: st.key,
          counts: st.counts,
          nilOk: st.nilOk,
          universal: st.universal,
          terminal: st.terminal,
          alts: st.alts,
          name: rm.names.get(st.key),
          label: stateLabel(st, sl.slices),
        })),
      });
    }

    const parts = [
      'PREFIX fhir: <http://hl7.org/fhir/>',
      'PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>',
      'PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>',
      '',
      'start = @<#' + p.name + '>',
      '',
      '<#' + p.name + '> {\n  ' + rootTCs.join(' ;\n  ') + '\n}',
    ];
    const emit = map => { for (const text of map.values()) parts.push('', text); };
    emit(buckets.state);
    emit(buckets.li);
    emit(buckets.cc);
    if (buckets.usesAny)
      parts.push('', '# any well-formed list\n<#AnyList> [rdf:nil] OR { fhir:first . ; fhir:rest @<#AnyList> }');

    return { text: parts.join('\n'), parsed: p, machines, warnings: p.warnings };
  }

  // ------------------------------------------------------------ example data

  /** Simplified from http://hl7.org/fhir/StructureDefinition/bp */
  const BP_EXAMPLE = {
    resourceType: 'StructureDefinition',
    id: 'bp-simplified',
    url: 'http://example.org/fhir/StructureDefinition/bp-simplified',
    name: 'BloodPressure',
    status: 'active',
    description: 'Simplified from the HL7 blood pressure profile (http://hl7.org/fhir/StructureDefinition/bp): Observation.component is sliced by pattern on code into one systolic and one diastolic component.',
    kind: 'resource',
    type: 'Observation',
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/vitalsigns',
    derivation: 'constraint',
    differential: {
      element: [
        { id: 'Observation', path: 'Observation' },
        { id: 'Observation.status', path: 'Observation.status', min: 1, max: '1' },
        {
          id: 'Observation.code', path: 'Observation.code', min: 1, max: '1',
          patternCodeableConcept: {
            coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel with all children optional' }],
          },
        },
        {
          id: 'Observation.component', path: 'Observation.component', min: 2,
          slicing: {
            discriminator: [{ type: 'pattern', path: 'code' }],
            ordered: false,
            rules: 'open',
          },
        },
        { id: 'Observation.component:SystolicBP', path: 'Observation.component', sliceName: 'SystolicBP', min: 1, max: '1' },
        {
          id: 'Observation.component:SystolicBP.code', path: 'Observation.component.code', min: 1, max: '1',
          patternCodeableConcept: {
            coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }],
          },
        },
        { id: 'Observation.component:DiastolicBP', path: 'Observation.component', sliceName: 'DiastolicBP', min: 1, max: '1' },
        {
          id: 'Observation.component:DiastolicBP.code', path: 'Observation.component.code', min: 1, max: '1',
          patternCodeableConcept: {
            coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }],
          },
        },
      ],
    },
  };

  return { parseProfile, buildMachine, generate, BP_EXAMPLE };
}));
