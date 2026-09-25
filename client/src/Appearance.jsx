import { Fragment, useEffect, useRef, useState } from 'react';
import { APPEARANCES, loadAppearance, saveAppearance, watchSystemAppearance } from './theme.js';

export default function Appearance() {
  const [appearance, setAppearance] = useState(loadAppearance);
  const current = useRef(appearance);
  current.current = appearance;

  useEffect(() => watchSystemAppearance(() => current.current), []);

  const select = (value) => (e) => {
    e.preventDefault();
    saveAppearance(value);
    setAppearance(value);
  };

  return (
    <div className="appearance">
      表示：
      {APPEARANCES.map(({ value, label }, i) => (
        <Fragment key={value}>
          {i > 0 && '｜'}
          {value === appearance ? <b>{label}</b> : <a href="#" onClick={select(value)}>{label}</a>}
        </Fragment>
      ))}
    </div>
  );
}
