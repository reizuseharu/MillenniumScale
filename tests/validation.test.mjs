import { load, suite, eq } from './harness.mjs';

export default function run() {
  const S = suite('Validation');
  const t = (n, f) => S.test(n, f);
  const { MS } = load({ files: ['js/core.js'] });

  const list = {
    id: 'TCG-2026-05-18', date: '2026-05-18', cards: [
      { id: 55144522, name: 'Pot of Greed', status: 0 },
      { id: 24224830, name: 'Called by the Grave', status: 1 },
      { id: 94145021, name: 'Droll & Lock Bird', status: 2 }
    ]
  };
  const filler = (n, from = 900000) => new Array(n).fill(0).map((_, i) => from + i);

  t('copy limits by status and ruleset', () => {
    const r = MS.rulesFor('TCG');
    eq(MS.allowedCopies(0, 'advanced', r), 0);
    eq(MS.allowedCopies(0, 'traditional', r), 1);
    eq(MS.allowedCopies(1, 'advanced', r), 1);
    eq(MS.allowedCopies(2, 'advanced', r), 2);
    eq(MS.allowedCopies(3, 'advanced', r), 3);
  });

  t('flags forbidden, over-limit and semi-limit breaches', () => {
    const deck = { main: [55144522, 24224830, 24224830, 94145021, 94145021, 94145021], extra: [], side: [] };
    const r = MS.validate(deck, list, { formatKey: 'TCG', mode: 'advanced' });
    eq(r.copyProblems.length, 3);
    eq(r.legal, false);
  });

  t('copies count across Main, Extra and Side together', () => {
    const r = MS.validate({ main: [24224830], extra: [], side: [24224830] }, list, { formatKey: 'TCG' });
    eq(r.copyProblems.length, 1);
  });

  t('Traditional converts Forbidden to one copy', () => {
    eq(MS.validate({ main: [55144522], extra: [], side: [] }, list, { formatKey: 'TCG', mode: 'traditional' }).copyProblems.length, 0);
    eq(MS.validate({ main: [55144522], extra: [], side: [] }, list, { formatKey: 'TCG', mode: 'advanced' }).copyProblems.length, 1);
  });

  t('enforces deck sizes', () => {
    const r = MS.validate({ main: filler(39), extra: filler(16, 800000), side: [] },
      { id: 'x', date: '2026-01-01', cards: [] }, { formatKey: 'TCG' });
    eq(r.sizeProblems.map((p) => p.text), ['Main Deck', 'Extra Deck']);
  });

  t('Master Duel has no Side Deck', () => {
    const r = MS.validate({ main: filler(40), extra: [], side: [900001] },
      { id: 'x', date: '2026-01-01', cards: [] }, { formatKey: 'MD' });
    if (!r.sizeProblems.some((p) => /no Side Deck/.test(p.why))) throw new Error('not flagged');
  });

  t('a whitelist list bans everything unlisted', () => {
    const wl = { id: 'w', date: '2026-01-01', whitelist: true, cards: [{ id: 1, status: 3 }] };
    eq(MS.validate({ main: [1, 2], extra: [], side: [] }, wl, { formatKey: 'TCG' }).copyProblems.length, 1);
  });

  t('a clean deck passes', () => {
    eq(MS.validate({ main: filler(40), extra: [], side: [] }, list, { formatKey: 'TCG' }).legal, true);
  });

  t('cards in the wrong pile are flagged', () => {
    const { MS: M } = load({
      files: ['js/core.js'],
      cards: [
        { id: 700001, name: 'A Link Monster', frame: 'link', type: 'Link Monster', race: 'Cyberse', linkval: 2, atk: 1200, alts: [] },
        { id: 700002, name: 'A Normal Monster', frame: 'normal', type: 'Normal Monster', race: 'Dragon', level: 4, atk: 1000, def: 1000, alts: [] }
      ]
    });
    const r = M.validate({ main: [700001], extra: [700002], side: [] }, { id: 'x', date: '2026-01-01', cards: [] }, { formatKey: 'TCG' });
    const why = r.sizeProblems.filter((p) => p.kind === 'placement').map((p) => p.why);
    eq(why.length, 2);
    if (!why.some((w) => /belongs in the Extra Deck/.test(w))) throw new Error('link not flagged');
    if (!why.some((w) => /belongs in the Main Deck/.test(w))) throw new Error('normal not flagged');
  });

  return S.report();
}
