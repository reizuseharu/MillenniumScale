import { load, suite, eq, throws } from './harness.mjs';

export default function run() {
  const S = suite('Parsers');
  const t = (n, f) => S.test(n, f);
  const { MS } = load({ files: ['js/core.js'] });

  /* ---- .conf / LFList ---- */

  t('reads sections, statuses and names from a .conf', () => {
    const lists = MS.parseLFList(`#comment
!2026.05 TCG
#forbidden
23434538 0 --Maxx "C"
55144522 0 --Pot of Greed
#limited
24224830 1 --Called by the Grave
!2026.02 TCG
$whitelist
89631139 2 --Blue-Eyes White Dragon
`);
    eq(lists.length, 2);
    eq(lists[0].name, '2026.05 TCG');
    eq(lists[0].cards.length, 3);
    eq(lists[0].cards[0], { id: 23434538, name: 'Maxx "C"', status: 0 });
    eq(lists[1].whitelist, true);
    eq(lists[1].cards[0].status, 2);
  });

  t('ignores junk lines and out-of-range statuses', () => {
    eq(MS.parseLFList('!x\nnot a line\n123 9 --nope\n999 1 --yes\n')[0].cards.length, 1);
  });

  t('reads the archive\u2019s day-first dates', () => {
    eq(MS.guessListDate('TCG 18.05.2026'), '2026-05-18');
    eq(MS.guessListDate('01.07.2021 TCG'), '2021-07-01');
    eq(MS.guessListDate('OCG 08.2000'), '2000-08-01');
    eq(MS.guessListDate('2026-05-18 MD'), '2026-05-18');
    eq(MS.guessListDate('nonsense'), null);
  });

  t('round-trips through serializeLFList', () => {
    const orig = MS.parseLFList('!L\n23434538 0 --A\n24224830 1 --B\n')[0];
    eq(MS.parseLFList(MS.serializeLFList({ label: 'L', cards: orig.cards }))[0].cards, orig.cards);
  });

  /* ---- .ydk ---- */

  t('reads main / extra / side from a .ydk', () => {
    const d = MS.parseYDK('#created by Tester\n#main\n23434538\n23434538\n#extra\n88581108\n!side\n94145021\n');
    eq(d.name, 'Tester');
    eq([d.main, d.extra, d.side], [[23434538, 23434538], [88581108], [94145021]]);
  });

  t('.ydk round-trips', () => {
    const b = MS.parseYDK(MS.toYDK({ main: [1, 2], extra: [3], side: [4] }));
    eq([b.main, b.extra, b.side], [[1, 2], [3], [4]]);
  });

  /* ---- ydke:// ---- */

  t('ydke round-trips', () => {
    const uri = MS.toYDKE({ main: [23434538, 55144522], extra: [88581108], side: [] });
    if (!uri.startsWith('ydke://')) throw new Error('bad prefix');
    const b = MS.parseYDKE(uri);
    eq([b.main, b.extra, b.side], [[23434538, 55144522], [88581108], []]);
  });

  t('a malformed ydke explains itself', () => {
    throws(() => MS.parseYDKE('ydke://abc'), /three/);
  });

  /* ---- JSON ---- */

  t('main/extra/side with counts', () => {
    const d = MS.parseDeckJSON(JSON.stringify({ name: 'X', main: [{ id: 1, count: 3 }], extra: [{ id: 2, count: 1 }], side: [] }));
    eq(d.main, [1, 1, 1]); eq(d.extra, [2]); eq(d.name, 'X');
  });

  t('flat array of ids', () => {
    const d = MS.parseDeckJSON('[1,1,2]');
    eq(d.pending.length, 3); eq(d.needsResolve, true);
  });

  t('cards[] carrying its own section field', () => {
    const d = MS.parseDeckJSON(JSON.stringify({ cards: [{ id: 9, qty: 2, section: 'Extra Deck' }, { id: 8, qty: 1, deck: 'main' }] }));
    eq(d.extra, [9, 9]); eq(d.main, [8]);
  });

  t('nested under "deck"', () => {
    eq(MS.parseDeckJSON(JSON.stringify({ deck: { main: [5, 5], extra: [], side: [] } })).main, [5, 5]);
  });

  t('typed sections: Monsters/Spells/Traps all mean Main', () => {
    const d = MS.parseDeckJSON(JSON.stringify({
      Name: 'T', Monsters: [{ CardDatabaseId: 11, Quantity: 2 }],
      Spells: [{ CardDatabaseId: 22, Quantity: 1 }], Traps: [{ CardDatabaseId: 33, Quantity: 1 }],
      Extra: [{ CardDatabaseId: 44, Quantity: 1 }], Side: [{ CardDatabaseId: 55, Quantity: 3 }]
    }));
    eq(d.name, 'T');
    eq(d.main, [11, 11, 22, 33]);
    eq(d.extra, [44]);
    eq(d.side, [55, 55, 55]);
  });

  t('an unrecognised shape says what it expected', () => {
    throws(() => MS.parseDeckJSON('{"foo":1}'), /main/);
  });

  /* ---- sniffing ---- */

  t('routes ydke / json / ydk by content', () => {
    eq(MS.parseDeckText('ydke://!!!').main, []);
    eq(MS.parseDeckText('{"main":[7],"extra":[],"side":[]}').main, [7]);
    eq(MS.parseDeckText('#main\n7\n').main, [7]);
  });

  /* ---- passcodes ---- */

  t('passcodes pad to 8 characters', () => {
    eq(MS.passcode(440556), '00440556');
    eq(MS.passcode(2263869), '02263869');
    eq(MS.passcode(55144522), '55144522');
    eq(MS.passcode('295517'), '00295517');
  });

  t('either passcode form parses back to the number', () => {
    eq(MS.parsePasscode('00440556'), 440556);
    eq(MS.parsePasscode('440556'), 440556);
    eq(MS.parsePasscode(440556), 440556);
  });

  return S.report();
}
