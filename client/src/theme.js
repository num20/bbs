const KEY = 'bbs:appearance';
const media = window.matchMedia('(prefers-color-scheme: dark)');

export const APPEARANCES = [
  { value: 'auto', label: '自動' },
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
];

export const loadAppearance = () => localStorage.getItem(KEY) ?? 'auto';

export const applyAppearance = (appearance) => {
  const dark = appearance === 'dark' || (appearance === 'auto' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
};

export const saveAppearance = (appearance) => {
  localStorage.setItem(KEY, appearance);
  applyAppearance(appearance);
};

// 「自動」のときは OS の設定変更に追従
export const watchSystemAppearance = (getAppearance) => {
  const onChange = () => getAppearance() === 'auto' && applyAppearance('auto');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
