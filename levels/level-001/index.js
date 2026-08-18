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

const QUEUE_ART = ['KKK', 'RRK', 'RRR', 'GDR', 'GKK', 'KKK', 'WGD', 'W..'];

export default { art: ART, queueArt: QUEUE_ART };
