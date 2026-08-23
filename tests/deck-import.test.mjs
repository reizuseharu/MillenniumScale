import fs from 'node:fs';
import { load, suite, eq, findAll } from './harness.mjs';

export default function run() {
  const S = suite('Deck import and rendering');
  const t = (n, f) => S.test(n, f);
  const { MS } = load();

  /* ---- the converter's own shape, with Konami ids ---- */

  const sample = JSON.stringify({
    Name: 'Sample',
    Monsters: [{ CardDatabaseId: 20207, Quantity: 3 }, { CardDatabaseId: 11002, Quantity: 3 }],
    Spells: [{ CardDatabaseId: 4342, Quantity: 3 }],
    Traps: [{ CardDatabaseId: 13631, Quantity: 3 }],
    Extra: [{ CardDatabaseId: 19880, Quantity: 2 }],
    Side: [{ CardDatabaseId: 14740, Quantity: 3 }]
  });

  t('typed sections and quantities expand correctly', () => {
    const d = MS.parseDeckJSON(sample);
    eq(d.name, 'Sample');
    eq(d.shape, 'typed sections');
    eq(d.main.length, 12);
    eq(d.extra.length, 2);
    eq(d.side.length, 3);
  });

  t('short ids are recognised as a non-passcode space', () => {
    eq(MS.parseDeckJSON(sample).idSpace, 'foreign');
    eq(MS.parseYDK('#main\n23434538\n55144522\n').idSpace, 'passcode');
  });

  t('the shipped Konami map translates them to passcodes', () => {
    const d = MS.parseDeckJSON(sample);
    const rep = MS.applyIdMap(d);
    eq(rep.needed, true);
    eq(rep.available, true);
    eq(rep.total, 17);
    eq(rep.mapped, 17);
    eq(rep.unmapped, []);
    d.main.concat(d.extra, d.side).forEach((id) => {
      if (id < 100000) throw new Error('id ' + id + ' was not translated');
    });
  });

  t('translation is idempotent across repeated runs', () => {
    const d = MS.parseDeckJSON(sample);
    const a = MS.applyIdMap(d), b = MS.applyIdMap(d);
    eq(a.mapped, b.mapped);
    eq(d.main.length, 12);
  });

  t('round-trips back out to the converter shape', () => {
    const d = MS.parseDeckJSON(sample);
    MS.applyIdMap(d);
    const out = MS.toConverterJSON(d, 'Sample');
    eq(out.Name, 'Sample');
    eq(out.Side.length, 1);
    eq(out.Side[0], { CardDatabaseId: 14740, Quantity: 3 });
    const mainTotal = [...out.Monsters, ...out.Spells, ...out.Traps].reduce((n, e) => n + e.Quantity, 0);
    eq(mainTotal, 12);
  });

  t('a passcode deck needs no translation at all', () => {
    const d = MS.parseYDK('#main\n23434538\n#extra\n#side\n');
    eq(MS.applyIdMap(d).needed, false);
  });

  /* ---- detail sheet ---- */

  const env = load({
    files: ['js/core.js'],
    cards: [{
      id: 89631139, name: 'Blue-Eyes White Dragon', frame: 'normal', type: 'Normal Monster',
      race: 'Dragon', attribute: 'LIGHT', level: 8, atk: 3000, def: 2500,
      desc: 'This legendary dragon...', tcgDate: '2002-03-08', ocgDate: '1999-01-01', alts: []
    }]
  });
  const card = env.MS.cards.get(89631139);
  env.MS.showCard({ card, name: card.name, id: card.id, displayId: card.id, status: 1, total: 0 });
  const dlg = env.created.find((n) => n.attrs.id === 'card-sheet');

  t('the detail sheet opens with art, stats and card text', () => {
    if (!dlg) throw new Error('no dialog');
    eq(dlg.open, true);
    eq(findAll(dlg, 'sheet-body')[0].classes.has('has-art'), true);
    eq(findAll(dlg, 'sheet-detail').length, 1);
    eq(findAll(dlg, 'kv').length, 1);
    eq(findAll(dlg, 'oracle').length, 1);
  });

  t('art points at the full-size image and fades in on load', () => {
    const art = findAll(dlg, 'sheet-art')[0];
    eq(art.attrs.src, 'https://images.ygoprodeck.com/images/cards/89631139.jpg');
    eq(art.classes.has('ready'), false);
    art.fire('load');
    eq(art.classes.has('ready'), true);
  });

  t('a failed image collapses the sheet to one column', () => {
    const env2 = load({ files: ['js/core.js'] });
    env2.MS.showCard({ card: null, name: 'Unknown', id: 440556, displayId: 440556, status: 0, total: 0 });
    const body = env2.created.find((n) => n.classes.has('sheet-body'));
    const art = env2.created.find((n) => n.classes.has('sheet-art'));
    eq(body.classes.has('has-art'), true);
    art.fire('error');
    eq(art.removed, true);
    eq(body.classes.has('has-art'), false);
  });

  /* ---- theme ---- */

  t('the theme survives the round-trip the head script performs', () => {
    const env3 = load({ files: ['js/core.js'] });
    env3.MS.theme.set('dark');
    const raw = env3.store['ms.theme'];
    let t2 = null; try { t2 = JSON.parse(raw); } catch (e) { t2 = raw; }
    eq(t2, 'dark');
  });

  return S.report();
}
