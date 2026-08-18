import palette from './palette.json' with { type: 'json' };

/** 第二关：由 tools/image_to_art.py 生成 ART 后写入此文件。 */
const ART = [
  '..............KKKKKK..............',
  '............KKKRRRRKKK............',
  '............KRRRRROWRK............',
  'KKKKK.......KRRRRROWRK............',
  'KYOOK.......KRRRRRRRRK............',
  'KKKYOKKKKKKKKWWWWWWWWKKKKKK.......',
  'KKYOKKKKWWWWWWWWWWWWWWWWWWKK......',
  '.KOKOKKOWWWWWWWWWWWWWWWWWWWKK.....',
  '.KKYKOWWWWRRRRORRWWWWWWWWWWWK.....',
  '..KKOWWWWWRRRRRRRROWWWWWWWWWK.....',
  '..KKOOWWWWWWRRRRRRWWWWWWWWWWK.....',
  '...KOOOWWWWWWWWWWWWWWWWWWWWWK.....',
  '...KKYOWWWWWWWWWWWWWWWWWWWWWK.....',
  '..KKKYOOWWMWWMMMMMMMMMWWMWWKKK....',
  '.KKMKOMMMMMWWMMMMMMMMMWMWWMMKKK...',
  'KKPMPPMPPPMMMPMMPPPPPPMMMMPMMGKKKK',
  'KPPPPMPMMPPPPMPPPPPPMPMPPPPMMMGMMK',
  'KPPPMPPPPMPPMPPPPPPPPMPPPPPMMGGGMK',
  'KPMPPPPPPPMPPMPPPPMMPPPPPPPMGGGGMK',
  'KMPPPPPPPMPPPPPPPMMPPPPPPPMGGGGMMK',
  'KKPPPPPPMPPPPPPPMMPPPPPPPMPMGGMMKK',
  'KCCCCBBBBBBGYYYYYYYYYYGBBBBBBCCCK.',
  'KCCCCBBBBBBBBYYYYYYYYBBBBBBBBCCCK.',
  'KKCCCBBBBBBBBBYYYYYYBBBBBBBBBCCKK.',
  '.KKCCCCBBBBBBBBBBBBBBBBBBBBCCCKK..',
  '..KKCCCCCCCCCCCCCCCCCCCCCCCCCKK...',
  '...KKCCCCCCCCCCCCCCCCCCCCCCCKK....',
  '...KKKKKKKKKKKCCCCKKKKKKKKKKK.....',
  '.......KKKKKKKCCCCKKKKKKKK........',
  '......KKCCCCCCCCCCCCCCCCCKK.......',
  '.....KKCCCCCCCCCCCCCCCCCCCKK......',
  '.....KKCCCCCCCCCCCCCCCCCCCKK......',
  '.....KKKCCCCCCCCCCCCCCCCCKKK......',
  '......KKKKKKKKKKKKKKKKKKKKK.......'
];

// 四条队列刻意不按颜色均分：前排只有 K/W/C/O。K 是外框的开路钥匙；
// 其余颜色会占住阵地或等待路径打开。每个 ammo 的总和严格等于地图同色格数。
const QUEUE = [
  [{ color: 'K', ammo: 49 }, { color: 'R', ammo: 44 }, { color: 'K', ammo: 49 }, { color: 'K', ammo: 49 }, { color: 'K', ammo: 50 }],
  [{ color: 'W', ammo: 50 }, { color: 'P', ammo: 40 }, { color: 'W', ammo: 50 }, { color: 'P', ammo: 40 }, { color: 'W', ammo: 47 }, { color: 'P', ammo: 39 }],
  [{ color: 'C', ammo: 39 }, { color: 'B', ammo: 33 }, { color: 'C', ammo: 39 }, { color: 'B', ammo: 33 }, { color: 'C', ammo: 38 }, { color: 'C', ammo: 38 }],
  [{ color: 'O', ammo: 22 }, { color: 'Y', ammo: 30 }, { color: 'G', ammo: 17 }, { color: 'M', ammo: 41 }, { color: 'M', ammo: 40 }]
];

export default { art: ART, queue: QUEUE, palette };
