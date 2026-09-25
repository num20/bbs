import { useEffect, useState } from 'react';
import { api } from './api.js';
import { formatDate } from './format.js';
import PostForm from './PostForm.jsx';

export default function ThreadList({ title }) {
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.threads().then(setThreads).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async (data) => {
    const { id } = await api.createThread(data);
    location.hash = `#/thread/${id}`;
  };

  return (
    <>
      <table className="header-box" width="100%" cellPadding="4">
        <tbody>
          <tr>
            <td align="center">
              <h1>{title}</h1>
              <p className="marquee"><span>★☆★ ようこそいらっしゃいました！ 荒らしは放置でお願いします。 マターリいきましょう (´ー｀) ★☆★</span></p>
              <p className="small">
                ■ローカルルール■<br />
                ・誹謗中傷・宣伝行為は禁止です。<br />
                ・コピペ荒らしはスルーしてください。<br />
                ・sage進行推奨。
              </p>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="menu-box" width="100%" cellPadding="4">
        <tbody>
          <tr>
            <td>
              <b>スレッド一覧</b>
              {error && <p className="error">ＥＲＲＯＲ：{error}</p>}
              {threads === null ? (
                <p>読み込み中…</p>
              ) : threads.length === 0 ? (
                <p>まだスレッドがありません。1 ゲットのチャンス！</p>
              ) : (
                <ol className="thread-list">
                  {threads.map((t) => (
                    <li key={t.id}>
                      <a href={`#/thread/${t.id}`}>{t.title} ({t.postCount})</a>
                      <span className="small"> 最終更新：{formatDate(t.bumpedAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
              <a href="#/" onClick={(e) => { e.preventDefault(); load(); }}>▲リロード</a>
            </td>
          </tr>
        </tbody>
      </table>

      <table className="form-box" width="100%" cellPadding="4">
        <tbody>
          <tr>
            <td>
              <b>新規スレッド作成</b>
              <PostForm withTitle submitLabel="新規スレッド作成" onSubmit={create} />
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
