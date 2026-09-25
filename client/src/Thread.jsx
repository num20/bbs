import { Fragment, useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { formatDate } from './format.js';
import PostForm from './PostForm.jsx';

// 本文中の >>1 アンカーと URL をリンク化
const renderBody = (text) =>
  text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(>>\d+|https?:\/\/[^\s]+)/g).map((part, j) => {
        if (/^>>\d+$/.test(part)) return <a key={j} href={`#res${part.slice(2)}`} onClick={(e) => { e.preventDefault(); document.getElementById(`res${part.slice(2)}`)?.scrollIntoView(); }}>{part}</a>;
        if (/^https?:\/\//.test(part)) return <a key={j} href={part} target="_blank" rel="noreferrer">{part}</a>;
        return part;
      })}
    </Fragment>
  ));

const Post = ({ post, onDelete }) => {
  const nameEl = (
    <b>
      {post.name}
      {post.trip && <span className="trip"> ◆{post.trip}</span>}
    </b>
  );
  return (
    <dl className="post" id={`res${post.num}`}>
      <dt>
        {post.num} ：
        {post.email && !post.deleted
          ? <a className="mail-name" href={`mailto:${post.email}`}>{nameEl}</a>
          : <span className="name">{nameEl}</span>}
        ：{post.deleted ? 'あぼーん' : `${formatDate(post.createdAt)} ID:${post.posterId}`}
        {!post.deleted && (
          <a className="del small" href="#" onClick={(e) => { e.preventDefault(); onDelete(post); }}> [削除]</a>
        )}
      </dt>
      <dd>{renderBody(post.body)}</dd>
    </dl>
  );
};

export default function Thread({ id }) {
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => api.thread(id).then(setThread).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const handleReply = async (data) => {
    await api.reply(id, data);
    await load();
  };

  const handleDelete = async (post) => {
    const pw = prompt(`>>${post.num} を削除します。削除キーを入力してください。`);
    if (!pw) return;
    try {
      await api.deletePost(post.id, pw);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  if (error) return <p className="error">ＥＲＲＯＲ：{error}</p>;
  if (!thread) return <p>読み込み中…</p>;

  const full = thread.posts.length >= thread.maxPosts;
  return (
    <div className="thread">
      <div className="nav small">
        <a href="#/">■掲示板に戻る■</a> <a href="#" onClick={(e) => { e.preventDefault(); load(); }}>全部</a>{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('res1')?.scrollIntoView(); }}>1-</a>{' '}
        <a href="#" onClick={(e) => { e.preventDefault(); document.getElementById('bottom')?.scrollIntoView(); }}>最新50</a>
      </div>
      <h2 className="thread-title">{thread.title}</h2>
      {thread.posts.map((p) => <Post key={p.num} post={p} onDelete={handleDelete} />)}
      <hr id="bottom" />
      {full ? (
        <p className="error">このスレッドは{thread.maxPosts}を超えました。もう書けないので、新しいスレッドを立ててくださいです。。。</p>
      ) : (
        <PostForm submitLabel="書き込む" onSubmit={handleReply} />
      )}
    </div>
  );
}
