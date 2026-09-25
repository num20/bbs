import { useEffect, useState } from 'react';
import { api } from './api.js';
import ThreadList from './ThreadList.jsx';
import Thread from './Thread.jsx';
import Appearance from './Appearance.jsx';

const useHashRoute = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => { setHash(location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const m = hash.match(/^#\/thread\/(\d+)/);
  return m ? { page: 'thread', id: m[1] } : { page: 'index' };
};

const Counter = () => {
  const [count, setCount] = useState(() => sessionStorage.getItem('bbs:count'));
  useEffect(() => {
    // 同一セッション内では加算しない
    if (sessionStorage.getItem('bbs:count')) return;
    sessionStorage.setItem('bbs:count', '0');
    api.counter().then((r) => { setCount(r.count); sessionStorage.setItem('bbs:count', r.count); });
  }, []);
  const value = count ?? 0;
  return <span className="counter">{String(value).padStart(7, '0')}</span>;
};

const useBoardTitle = () => {
  const [title, setTitle] = useState('');
  useEffect(() => {
    api.config().then((c) => { setTitle(c.title); document.title = c.title; }).catch(() => {});
  }, []);
  return title;
};

export default function App() {
  const route = useHashRoute();
  const title = useBoardTitle();
  return (
    <>
      <Appearance />
      {route.page === 'thread' ? <Thread id={route.id} /> : <ThreadList title={title} />}
      <hr />
      <div className="footer">
        <p>あなたは <Counter /> 人目のお客様です。</p>
        <p>
          <a href="#/">■掲示板に戻る■</a>
        </p>
        <p className="small">
          powered by React + fastify + SQLite3 ／ 推奨環境：Netscape Navigator 4.x 以上・800×600
        </p>
      </div>
    </>
  );
}
