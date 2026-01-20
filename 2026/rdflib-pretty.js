const Nested = document.getElementById("nested")
const Src = document.getElementById("src")
const Target = document.getElementById("target")
Nested.addEventListener("click", nested);

const Good = 'good'
const Bad = 'bad'

function nested (evt) {
  const printer = evt.target.id === 'nested' ? new NestedPrinter() : new SkolemPrinter()
  const [className, text] = execute(Src.value, printer);
  Target.value = text;
  Target.className = className;
}

function execute (txt, printer) {
  const self = {
    graph: new GraphMockup()
  }
  try {
    eval(txt)
    const ret = self.graph.toString(printer);
    return [Good, ret]
  } catch (e) {
    console.error(e)
    return [Bad, e.stack]
  }
}

class GraphMockup {
  constructor () {
    this.triples = []
  }
  add (s,p,o) {
    this.triples.push([s,p,o])
  }
  toString (printer) {
    return printer.add(this.triples).render()
  }
}

class SkolemPrinter {
  constructor () {
    this.indentDepth = 2
    this._lines = [] // list[list[string]]
  }
  add (triples) {
    for (let [s,p,o] of triples) {
      if (this._subjectStack.length > 0 && !s.equals(this._subjectStack[this._subjectStack.length - 1])) {
        while (this._subjectStack.length > 1 && !(s.equals(this._subjectStack[this._subjectStack.length - 1]))) {
          const x = this._subjectStack.pop()
          this._lines.push(`${this._indent()} ] # ${x.__str__()}`)
        }
      }
      let sStr = null
      let oStr = null
      if (this._subjectStack.length === 0) {
        this._terminate(' .')
        sStr = s.__str__()
        this._subjectStack.push(s)
      } else {
        this._terminate(' ;')
        sStr = this._indent()
      }
      if (o.type === 'BNode') {
        this._subjectStack.push(o)
        oStr = `[ # ${o.__str__()}`
        this.dontTerminate = true
      } else {
        oStr = o.__str__()
        this.dontTerminate = false
      }
      const pStr = p.__str__()
      this._lines.push(`${sStr} ${pStr} ${oStr}`)
    }
    return this
  }
  render () {
    while (this._subjectStack.length > 1) {
      const x = this._subjectStack.pop()
      if (x.type === 'BNode') // theoretically could on test on 1st subject
        this._lines.push(`${this._indent()} ] # ${x.__str__()}`)
    }
    this._terminate(' .')
    return this._lines.join('\n')
  }
  _indent () { return ' '.repeat(this._subjectStack.length * this.indentDepth) }
  _terminate (terminator) {
    if (this._lines.length > 0 && !this.dontTerminate) // or this._lines[this._lines.length - 1].endsWith('[')
      this._lines[this._lines.length - 1] += terminator
  }
}

class NestedPrinter {
  constructor () {
    this.indentDepth = 2
    this._subjectStack = [] // list[Node]
    this._lines = [] // list[string]
  }
  add (triples) {
    for (let [s,p,o] of triples) {
      if (this._subjectStack.length > 0 && !s.equals(this._subjectStack[this._subjectStack.length - 1])) {
        while (this._subjectStack.length > 0 && !(s.equals(this._subjectStack[this._subjectStack.length - 1]))) {
          const x = this._subjectStack.pop()
          if (this._subjectStack.length > 0)
            this._lines.push(`${this._indent()} ] # ${x.__str__()}`)
        }
      }
      let sStr = null
      let oStr = null
      if (this._subjectStack.length === 0) {
        this._terminate(' .')
        sStr = s.__str__()
        this._subjectStack.push(s)
      } else {
        this._terminate(' ;')
        sStr = this._indent()
      }
      if (o.type === 'BNode') {
        this._subjectStack.push(o)
        oStr = `[ # ${o.__str__()}`
        this.dontTerminate = true
      } else {
        oStr = o.__str__()
        this.dontTerminate = false
      }
      const pStr = p.__str__()
      this._lines.push(`${sStr} ${pStr} ${oStr}`)
    }
    return this
  }
  render () {
    while (this._subjectStack.length > 1) {
      const x = this._subjectStack.pop()
      if (x.type === 'BNode') // theoretically could on test on 1st subject
        this._lines.push(`${this._indent()} ] # ${x.__str__()}`)
    }
    this._terminate(' .')
    return this._lines.join('\n')
  }
  _indent () { return ' '.repeat(this._subjectStack.length * this.indentDepth) }
  _terminate (terminator) {
    if (this._lines.length > 0 && !this.dontTerminate) // or this._lines[this._lines.length - 1].endsWith('[')
      this._lines[this._lines.length - 1] += terminator
  }
}

function URIRef (txt) {
  const type = 'URIRef'
  const u = new URL(txt, document.URL)
  const str = `<${txt}>`
  return {
    type,
    str,
    fragment: u.hash,
    __str__: () => str,
    equals: (r) => r && r.type === type && str === r.__str__(),
  }
}

let NextBnode = 0
function BNode () {
  const type = 'BNode'
  const id = NextBnode++
  const str = `_:${id}`
  return {
    type,
    id,
    __str__: () => str,
    equals: (r) => r && r.type === type && str === r.__str__(),
  }
}

function Literal (value, parms = {}) {
  const type = 'Literal'
  const datatype
        = !parms.datatype ? null
        : typeof parms.datatype === 'object' ? parms.datatype
        : URIRef(parms.datatype)
  const language = parms.language
  const str = `"${value}"`
        + (datatype ? '^^' + datatype.__str__() : '')
        + (language ? '@' + language : '')
  return {
    type,
    value,
    language,
    datatype,
    __str__: () => str,
    equals: (r) => r && r.type === type && str === r.__str__()
  }
}

const XSD_NS = 'http://www.w3.org/2001/XMLSchema#'
const XSD = {
  integer : URIRef(`${XSD_NS}integer`)
}

const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const RDF = {
  type: URIRef(`${RDF_NS}type`),
}

const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#'
const RDFS = {
  label: URIRef(`${RDFS_NS}label`),
}

const V_NS = 'http://example.org/'
const V = {
  Stage: URIRef(`${V_NS}Stage`),
  ordinal: URIRef(`${V_NS}ordinal`),
  p1: URIRef(`${V_NS}p1`),
  p2: URIRef(`${V_NS}p2`),
  p3: URIRef(`${V_NS}p3`),
  steps: URIRef(`${V_NS}steps`),
}

class RelativizeUrl {
  static components = [
    {name: 'protocol', write: u => u.protocol },
    {name: 'hostname', write: u => '//' + u.hostname },
    {name: 'port', write: u => ':' + u.port },
    {name: 'pathname', write: (u, frm, relativize) => {
      if (!relativize) return u.pathname;
      const f = frm.pathname.split('/').slice(1);
      const t = u.pathname.split('/').slice(1);
      const maxDepth = Math.max(f.length, t.length);

      let start = 0;
      while(start < maxDepth && f[start] === t[start]) ++start;
      const rel = f.slice(start+1).map(c => '..').concat(t.slice(start === f.length ? start - 1 : start)).join('/');
      return rel.length <= u.pathname.length ? rel : u.pathname
    }},
    {name: 'search', write: u => u.search },
    {name: 'hash', write: u => u.hash},
  ];

  constructor (base, options) { this.base = base; this.options = options; }

  relate (rel) { return RelativizeUrl.relativize(rel, this.base, this.options); }

  static relativize (rel, base, opts = {}) { // opts not yet used
    const from = new URL(base);
    const to = new URL(rel, from);
    let ret = '';
    for (let component of RelativizeUrl.components) {
      if (ret) { // force abs path if e.g. host was diffferent
        if (to[component.name]) {
          ret += component.write(to, from, false);
        }
      } else if (from[component.name] !== to[component.name]) {
        ret = component.write(to, from, true);
      }
    }
    return ret;
  }
}
