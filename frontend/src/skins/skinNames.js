// Names only (no components), so the classic app can show the switcher without loading every skin.
export const SKIN_NAMES = {
  classic: 'Classic · 原版',
  A: 'Cryo Glass · 冷霜磨砂玻璃',
  B: 'Flight Deck · 琥珀飞行控制台',
  C: 'Editorial · 黑白编辑排版',
  D: 'Immersive HUD · 无框沉浸舱',
  E: 'Cryo Lens · 冷霜透镜',
  F: 'Retro CRT · 老式电脑',
  G: 'Comic · 漫画分镜',
  H: 'Blueprint · 工程蓝图',
  I: 'Incident File · 事故档案',
  J: 'Cockpit · 驾驶舱视角',
  K: 'Starry Night · 星夜油画',
  L: 'Event Horizon · 黑洞边缘',
  M: 'Meteor Storm · 陨石风暴应急',
  N: 'Ink Cosmos · 水墨太空',
  O: 'Woodblock · 浮世绘星海',
};
export const ORDER = Object.keys(SKIN_NAMES);

export function skinFromUrl() {
  const p = new URLSearchParams(location.search);
  const key = (p.get('skin') ?? p.get('variant') ?? '').toUpperCase();
  return SKIN_NAMES[key] && key !== 'CLASSIC' ? key : 'A';
}
