import * as S from '../store.js';
import { h, openCard, typeBadge, tierPill, colorClass } from '../ui.js';

// View-local filter state, survives re-renders.
const f = { q: '', type: 'All', edge: 'All', orphansOnly: false, showTypeFields: false };

export function render() {
  const rows = S.all()
    .filter(e => f.type === 'All' || e.type === f.type)
    .filter(e => !f.orphansOnly || S.isOrphan(e.id))
    .filter(e => {
      if (!f.q) return true;
      const hay = [e.title, e.notes, e.owner, S.TYPES[e.type].label, e.description, e.context]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(f.q.toLowerCase());
    })
    .sort((a, b) => S.TYPES[a.type].rung - S.TYPES[b.type].rung ||
                    a.type.localeCompare(b.type) || a.title.localeCompare(b.title));

  const cellSelect = (e, key, opts, blank) => h('td', { class: 'editable-cell' },
    h('select', {
      'data-focus-key': `${e.id}-${key}`,
      onchange: ev => S.update(e.id, { [key]: ev.target.value }),
    }, [blank ? h('option', { value: '' }, blank) : null,
        ...opts.map(o => h('option', { value: o, selected: o === e[key] }, o))]));

  const linkCells = (e) => {
    // The edge-type filter narrows what this column CONTAINS, not just how it looks —
    // derives vs threatens has to be a queryable dimension.
    const kinds = f.edge === 'All' ? null : f.edge === 'Derives only' ? 'derives'
                : f.edge === 'Threatens only' ? 'threatens' : 'equivalence';
    const links = S.linksFor(e.id).filter(x => !kinds || x.kind === kinds);
    if (!links.length) return h('td', { style: 'color:#aaa;' }, '—');
    return h('td', {}, links.map(x => {
      const other = S.get(x.from === e.id ? x.to : x.from);
      if (!other) return null;
      const dir = x.kind === 'equivalence' ? '⛓ ' : x.from === e.id ? '→ ' : '← ';
      return h('span', {
        class: 'edge-badge ' + x.kind,
        title: `${x.kind}: ${other.title || S.TYPES[other.type].label}`,
        onclick: ev => openCard(ev, other.id),
      }, x.kind, ' ', dir, (other.title || S.TYPES[other.type].label).slice(0, 26));
    }).filter(Boolean));
  };

  const table = h('table', { class: 'wire' },
    h('tr', {},
      h('th', {}, 'Type'), h('th', { style: 'width:24%;' }, 'Title'), h('th', {}, 'Owner'),
      h('th', {}, 'Status'), h('th', {}, 'Priority'), h('th', {}, 'Risk tier'),
      f.showTypeFields ? h('th', {}, 'Type-specific') : null,
      h('th', { style: 'width:26%;' }, `Linked${f.edge === 'All' ? '' : ' — ' + f.edge}`),
      h('th', {}, 'Attach.')),
    rows.map(e => h('tr', { class: S.isOrphan(e.id) ? 'orphanrow' : '' },
      h('td', {}, h('span', {
        class: 'type-badge ' + colorClass(e.type), style: 'cursor:pointer;',
        title: 'Open detail card',
        onclick: ev => openCard(ev, e.id),
      }, S.TYPES[e.type].label), S.isOrphan(e.id) ? h('span', { title: 'Orphan — no upward link', style: 'color:#b23a3a; font-weight:bold;' }, ' !') : null),
      h('td', { class: 'editable-cell' }, h('input', {
        value: e.title, placeholder: '(untitled)', 'data-focus-key': e.id + '-title',
        oninput: ev => S.update(e.id, { title: ev.target.value }),
      })),
      cellSelect(e, 'owner', S.OWNERS, '—'),
      cellSelect(e, 'status', S.STATUSES),
      cellSelect(e, 'priority', S.PRIORITIES),
      h('td', { style: 'cursor:pointer;', onclick: ev => openCard(ev, e.id) }, tierPill(e.id)),
      f.showTypeFields ? h('td', { style: 'font-size:10px; color:#666;' }, typeFields(e)) : null,
      linkCells(e),
      h('td', { style: 'text-align:center;' }, e.attachments.length || '0'))));

  return h('div', { class: 'view' },
    h('div', { class: 'toolbar' },
      h('input', {
        class: 'fake-input', placeholder: 'Search all entities…', value: f.q,
        'data-focus-key': 'db-q',
        oninput: ev => { f.q = ev.target.value; S.emit(); },
      }),
      h('select', {
        class: 'fake-input', onchange: ev => { f.type = ev.target.value; S.emit(); },
      }, [h('option', { value: 'All', selected: f.type === 'All' }, 'Entity type: All'),
          ...Object.keys(S.TYPES).map(t =>
            h('option', { value: t, selected: f.type === t }, S.TYPES[t].label))]),
      h('select', {
        class: 'fake-input', onchange: ev => { f.edge = ev.target.value; S.emit(); },
      }, ['All', 'Derives only', 'Threatens only', 'Equivalence only'].map(o =>
        h('option', { value: o, selected: f.edge === o }, o === 'All' ? 'Edge type: All' : o))),
      h('button', {
        class: 'fake-btn' + (f.orphansOnly ? ' on' : ''),
        onclick: () => { f.orphansOnly = !f.orphansOnly; S.emit(); },
      }, `Orphans only ${f.orphansOnly ? '☑' : '☐'}`),
      h('button', {
        class: 'fake-btn' + (f.showTypeFields ? ' on' : ''),
        onclick: () => { f.showTypeFields = !f.showTypeFields; S.emit(); },
      }, 'Type-specific fields'),
      h('select', {
        class: 'fake-input',
        onchange: ev => {
          if (!ev.target.value) return;
          const e = S.create(ev.target.value, {});
          ev.target.value = '';
          openCard({ stopPropagation() {}, clientX: window.innerWidth / 2, clientY: 140 }, e.id);
        },
      }, [h('option', { value: '' }, '+ New entity…'),
          ...Object.keys(S.TYPES).map(t => h('option', { value: t }, S.TYPES[t].label))]),
      h('span', { class: 'sync-note' },
        'click any cell to edit inline — writes to the same record shown on Ladder / Control Structure')),
    table,
    h('div', { class: 'rowcount' },
      `${rows.length} of ${S.all().length} entities · ` +
      `${S.all().filter(e => S.isOrphan(e.id)).length} orphan${S.all().filter(e => S.isOrphan(e.id)).length === 1 ? '' : 's'} (shaded red) · ` +
      `${S.edges().length} links`),
    h('div', { class: 'annotation' },
      'The edge-type filter narrows the contents of the Linked column, not just its highlighting — derives vs. threatens is a queryable dimension, not a colour. Orphan rows shade with the Loss colour, the same signal as the ! badge on the Ladder. Mission Canvas, Controller, Controlled Process and Control Action are exempt from orphan detection.'));
}

function typeFields(e) {
  switch (e.type) {
    case 'UCA': return `${e.uca_type || '—'} · ${(e.context || '').slice(0, 40)}`;
    case 'Metric': return `${e.value || '—'}${e.unit || ''} / thr ${e.threshold || '—'} · ${e.trend || '—'}`;
    case 'Controller': return e.ctype || '—';
    case 'Loss': case 'LossScenario': return (e.description || '—').slice(0, 50);
    case 'MissionCanvas': return (e.beneficiaries || '—').slice(0, 50);
    default: return '—';
  }
}
