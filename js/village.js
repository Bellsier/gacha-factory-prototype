// ---------------------------------------------------------------------------
// Task 113~117: the starting village on the green meadow (blueprint 24.8).
// The workshop (공방, `state.world.base`) is the village's production centre;
// around it stand facilities the player restores step by step:
//   감정소 (appraiser) — appraises unidentified relics and registers them in the codex
//   박물관 (museum)    — takes appraised relics as donations and puts them on display
// Unidentified relics are a collectible of their own, picked up now and then
// while mining. The crafting resource 고대 유물 (`relic`) is not touched.
// Progress lives in state.village (js/state.js, additive field, saveVersion 1).
// Game logic only: drawing is in js/topdown/, the panel in js/ui.js.
// ---------------------------------------------------------------------------
const VILLAGE = {
  FACILITIES: {
    appraiser: {
      name: '감정소',
      // walls on the ground, relative to the site point (the door step stays free, like a craft hut)
      box: { minX: -0.3, maxX: 0.3, minY: -0.38, maxY: -0.1 },
      requires: null,
      stages: [
        { name: '잔해 치우기', cost: { gold: 100 } },
        { name: '감정소 복구', cost: { gold: 400, products: { steel: 8, coalBrick: 4 } } },
      ],
    },
    museum: {
      name: '박물관',
      box: { minX: -0.42, maxX: 0.42, minY: -0.5, maxY: -0.1 },
      requires: 'appraiser', // the appraiser must be open first
      stages: [
        { name: '잔해 치우기', cost: { gold: 1200 } },
        { name: '박물관 복구', cost: { gold: 3000, products: { steel: 20, ironTool: 5 } } },
      ],
    },
  },
  ORDER: ['appraiser', 'museum'], // site choice and restoration order
  STAGE_NAMES: ['폐허', '정리됨', '운영 중'],
};

// The relic codex. Descriptions are plain finds; they do not settle the story
// (blueprint 23.4 leaves the lore open). weight: how often appraisal turns one up.
const VILLAGE_RELICS = [
  { key: 'potsherd',   name: '금 간 토기 조각', rarity: 'common',   weight: 6, desc: '흙빛 유약이 남은 그릇 조각.' },
  { key: 'oldCoin',    name: '닳은 동전',       rarity: 'common',   weight: 6, desc: '글자가 닳아 읽을 수 없는 작은 동전.' },
  { key: 'rustKey',    name: '녹슨 열쇠',       rarity: 'common',   weight: 6, desc: '어느 문을 열던 것인지 알 수 없는 열쇠.' },
  { key: 'lampStand',  name: '등잔 받침',       rarity: 'common',   weight: 6, desc: '그을음이 밴 작은 받침.' },
  { key: 'tile',       name: '문양 타일',       rarity: 'common',   weight: 6, desc: '되풀이되는 무늬가 새겨진 타일.' },
  { key: 'gear',       name: '얼어붙은 톱니',   rarity: 'common',   weight: 6, desc: '서리가 낀 채 굳은 작은 톱니바퀴.' },
  { key: 'bell',       name: '작은 청동 종',     rarity: 'uncommon', weight: 3, desc: '흔들면 아직 맑은 소리가 난다.' },
  { key: 'tablet',     name: '빛바랜 석판',     rarity: 'uncommon', weight: 3, desc: '절반쯤 지워진 기록이 남은 석판.' },
  { key: 'seal',       name: '장인의 인장',     rarity: 'uncommon', weight: 3, desc: '공방 장인이 쓰던 것으로 보이는 도장.' },
  { key: 'mapPiece',   name: '지도 조각',       rarity: 'uncommon', weight: 3, desc: '낯선 지형이 그려진 낡은 지도의 일부.' },
  { key: 'crystalRule', name: '수정 눈금자',    rarity: 'rare',     weight: 1, desc: '수정을 깎아 만든 정밀한 자.' },
  { key: 'feather',    name: '결정 깃털',       rarity: 'rare',     weight: 1, desc: '결정처럼 단단하게 굳은 깃털.' },
];
const VILLAGE_RELIC_KEYS = VILLAGE_RELICS.map(r => r.key);
const VILLAGE_RARITY_NAMES = { common: '흔함', uncommon: '드묾', rare: '희귀' };

function villageRelicByKey(key){ return VILLAGE_RELICS.find(r => r.key === key) || null; }

// state.village, made whole if an older state has none (tests replace state wholesale)
function villageState(){
  if(!state.village || typeof state.village !== 'object') state.village = freshVillageState();
  return state.village;
}

function villageFacilityName(key){ return (VILLAGE.FACILITIES[key] || {}).name || key; }
function villageStage(key){ return villageState().stage[key] || 0; }
function villageIsOpen(key){ return villageStage(key) >= VILLAGE.FACILITIES[key].stages.length; }
