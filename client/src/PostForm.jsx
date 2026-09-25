import { useState } from 'react';

const NAME_KEY = 'bbs:name';
const EMAIL_KEY = 'bbs:email';

export default function PostForm({ withTitle = false, submitLabel, onSubmit }) {
  const [title, setTitle] = useState('');
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [email, setEmail] = useState(() => localStorage.getItem(EMAIL_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      localStorage.setItem(NAME_KEY, name);
      localStorage.setItem(EMAIL_KEY, email);
      await onSubmit({ ...(withTitle && { title }), name, email, password, body });
      setTitle('');
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="post-form" onSubmit={handleSubmit}>
      {error && <p className="error">ＥＲＲＯＲ：{error}</p>}
      {withTitle && (
        <div>
          タイトル：<input size="40" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      )}
      <div>
        <input type="submit" value={sending ? '送信中…' : submitLabel} disabled={sending} />
        {' '}名前：<input size="19" value={name} onChange={(e) => setName(e.target.value)} />
        {' '}E-mail<span className="small">（省略可）</span>：
        <input size="19" value={email} onChange={(e) => setEmail(e.target.value)} />
        {' '}削除キー：<input type="password" size="8" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <textarea rows="5" cols="70" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="small">
        ※ 名前欄に「名前#キー」でトリップ、E-mail欄に「sage」でスレッドを上げずに書き込みできます。
      </div>
    </form>
  );
}
