import * as S from '../store.js';
import { h, openCard, toast } from '../ui.js';

const CELLS = [
  { key: 'key_partners',       name: 'Key Partners',        icon: '⛓', style: 'grid-row: 1 / 3;' },
  { key: 'key_activities',     name: 'Key Activities',      icon: '✓', style: 'grid-row: 1;' },
  { key: 'key_resources',      name: 'Key Resources',       icon: '☺', style: 'grid-row: 2;' },
  { key: '__value_props',      name: 'Value Propositions',  icon: '♦', style: 'grid-row: 1 / 3;' },
  { key: 'buy_in_and_support', name: 'Buy-in & Support',    icon: '♥', style: 'grid-row: 1;' },
  { key: 'deployment',         name: 'Deployment',          icon: '▸', style: 'grid-row: 2;' },
  { key: 'beneficiaries',      name: 'Beneficiaries',       icon: '☻', style: 'grid-row: 1 / 3;' },
];

const BOTTOM = [
  { key: 'cost_structure',  name: 'Mission Budget/Cost',                  icon: '$' },
  { key: 'impact_metrics',  name: 'Mission Achievement/Impact Factors',   icon: '▲' },
];

export function render() {
  const canvas = S.all().find(e => e.type === 'MissionCanvas');
  if (!canvas) {
    return h('div', { class: 'view' },
      h('button', { class: 'fake-btn primary', onclick: () => S.create('MissionCanvas', { title: 'New mission' }) },
        '+ Create mission canvas'));
  }
  const meta = S.canvasMeta();
  const reqs = S.outgoing(canvas.id, 'derives').map(x => S.get(x.to)).filter(r => r && r.type === 'MissionRequirement');
  const needsReview = meta.dirtyAt && meta.dirtyAt > (meta.reviewedAt || 0) && reqs.length > 0;

  const metaIn = (label, key, width) => h('div', {},
    h('label', {}, label),
    h('input', {
      value: meta[key] || '', style: width ? `width:${width}px;` : '',
      'data-focus-key': 'meta-' + key,
      oninput: e => { meta[key] = e.target.value; meta.dirtyAt = Date.now(); S.emit(); },
    }));

  const cell = (c) => {
    if (c.key === '__value_props') {
      return h('div', { class: 'mmc-cell', style: c.style },
        h('div', { class: 'lbl' }, h('span', { class: 'name' }, c.name), h('span', { class: 'icon' }, c.icon)),
        h('div', { style: 'font-size:10px; color:#777; margin-bottom:5px;' },
          '= Mission Requirements, not a separate field'),
        h('div', { class: 'mmc-vp' },
          reqs.length
            ? reqs.map(r => h('span', {
                class: 'type-badge c-mission',
                title: 'Click to edit this Mission Requirement',
                onclick: ev => openCard(ev, r.id),
              }, r.title || '(untitled)'))
            : h('span', { style: 'color:#999; font-size:10px;' }, 'no mission requirements yet')));
    }
    return h('div', { class: 'mmc-cell', style: c.style },
      h('div', { class: 'lbl' }, h('span', { class: 'name' }, c.name), h('span', { class: 'icon' }, c.icon)),
      h('textarea', {
        'data-focus-key': 'cell-' + c.key,
        oninput: e => S.update(canvas.id, { [c.key]: e.target.value }),
      }, canvas[c.key] || ''));
  };

  return h('div', { class: 'view' },
    h('div', { class: 'toolbar' },
      h('span', { class: 'sync-note' }, '✔ saved to this browser automatically'),
      h('button', { class: 'fake-btn', onclick: () => window.print() }, 'Generate 1-page printout'),
      h('span', { style: 'font-size:11px; color:#777;' },
        'this record feeds the Mission Requirements below — editing flags them for review, never overwrites them')),

    h('div', { class: 'mmc-sheet' },
      h('div', { class: 'mmc-headrow' },
        h('h2', {}, 'The Mission Model Canvas'),
        h('div', { class: 'mmc-meta' },
          metaIn('Mission/Problem Description:', 'description', 240),
          metaIn('Designed by:', 'designedBy', 90),
          metaIn('Date:', 'date', 70),
          metaIn('Version:', 'version', 30))),
      h('div', { class: 'mmc-top' }, CELLS.map(cell)),
      h('div', { class: 'mmc-bottom' }, BOTTOM.map(c => cell({ ...c, style: '' })))),

    h('div', { class: 'downstream-list' },
      h('h4', {}, `Mission requirements spawned from this canvas (${reqs.length})`),
      h('div', { class: 'row' },
        reqs.length
          ? reqs.map(r => h('span', {
              class: 'type-badge c-mission', style: 'cursor:pointer;',
              onclick: ev => openCard(ev, r.id),
            }, (r.title || '(untitled)') + (r.status === 'Completed' ? ' ✓' : ' …')))
          : h('span', { style: 'color:#999;' }, 'none yet'),
        h('button', {
          class: 'fake-btn',
          onclick: (ev) => {
            const r = S.create('MissionRequirement', { title: '', owner: 'Engineering', priority: 'High' });
            S.link(canvas.id, r.id);
            openCard(ev, r.id);
          },
        }, '+ New mission requirement'))),

    needsReview
      ? h('div', { class: 'review-banner' },
          h('span', {}, `⚠ This canvas changed after its ${reqs.length} Mission Requirement${reqs.length === 1 ? '' : 's'} were written. They are flagged "needs review" — nothing was overwritten.`),
          h('button', {
            class: 'fake-btn',
            onclick: () => { meta.reviewedAt = Date.now(); S.emit(); toast('Downstream requirements marked reviewed'); },
          }, 'Mark reviewed'))
      : null,

    h('div', { class: 'annotation' },
      'Key Partners, Key Activities, Key Resources and Buy-in & Support are stored on this record for reference — they spawn no derives edges and never appear on the Ladder. Value Propositions is not a field: it reflects the Mission Requirements below, since the two describe the same thing from opposite directions.'));
}
