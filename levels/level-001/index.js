/** 第一关：地图数据只属于关卡包，游戏运行时按需加载。 */
const ART = [
  '................KK................',
  '...............KRWK...............',
  '..............KRRRWK..............',
  '.............KRRRRRWK.............',
  '.............KRRKRRRK.............',
  '............KRRRKRRRWK............',
  '...........KRRRRRRRRRWK...........',
  '..........KRRRKRRRKRRRWK..........',
  '..........KRRRRRRRRRRRRK..........',
  '.KKK.....KRRKRRRRRRRKRRWK.....KKK.',
  'KRRRK....KRRKRRRKRRRKRRRK....KRRRK',
  'KRRRK...KRRRRRRRKRRRRRRRWK...KRRRK',
  'KRRRK...KRRRRRRRRRRRRRRRRK...KRRRK',
  '.KKGGK.KRRRRRRRRRRRRRRRRRWK.KGGKK.',
  '...KGGKKRRRRKRRRRRRRRKRRRRKKGGK...',
  '....KGGKRRRKWKRRRRRRKWKRRRRGGK....',
  '.....KKRRRRKKKRRRRRRKKKRRRRKK......',
  '.....KRKRRRRRRRRKKRRRRRRRRKRK.....',
  '....KRRRRRRRRRRRRRRRRRRRRRRRRK....',
  '....KRRRRRRRRRRRRRRRRRRRRRRRRK....',
  '...KGRRRRKRRRRRRRRRRRRRRKRRRRGK...',
  '..KGGGRRRKRRRRKRRRRKRRRRKRRRGGGK..',
  '..KDDGGGRRRRRRKRRRRKRRRRRRGGGDDK..',
  '...KDDGGGGRRRRRRRRRRRRRRGGGGDDK...',
  '....KDDDGGGGRRRRRRRRRRGGGGDDDK....',
  '.....KKDDDDGGGGGGGGGGGGDDDDKK.....',
  '.......KKDDDDDDDDDDDDDDDDKK.......',
  '...........KGKKKKKKKKGK...........',
  '...........KGK......KGK...........',
  '..........KKGK......KGKK..........',
  '.........KRRRRK....KRRRRK.........',
  '........KRRRRRK....KRRRRRK........',
  '........KWWWWWK....KWWWWWK........',
  '.........KKKKK......KKKKK.........'
];

const QUEUE = [
  [
    { color: 'K', ammo: 33 }, { color: 'R', ammo: 34 }, { color: 'R', ammo: 34 },
    { color: 'G', ammo: 20 }, { color: 'G', ammo: 20 }, { color: 'K', ammo: 33 },
    { color: 'W', ammo: 10 }, { color: 'W', ammo: 11 }
  ],
  [
    { color: 'K', ammo: 33 }, { color: 'R', ammo: 34 }, { color: 'R', ammo: 34 },
    { color: 'D', ammo: 19 }, { color: 'R', ammo: 35 }, { color: 'R', ammo: 35 },
    { color: 'G', ammo: 20 }
  ],
  [
    { color: 'K', ammo: 33 }, { color: 'K', ammo: 33 }, { color: 'R', ammo: 34 },
    { color: 'R', ammo: 34 }, { color: 'R', ammo: 35 }, { color: 'R', ammo: 35 },
    { color: 'D', ammo: 19 }
  ]
];

export default { art: ART, queue: QUEUE };
