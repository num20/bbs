const request = async (method, url, body) => {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? data.message ?? `ERROR ${res.status}`);
  return data;
};

export const api = {
  config: () => request('GET', '/api/config'),
  threads: () => request('GET', '/api/threads'),
  thread: (id) => request('GET', `/api/threads/${id}`),
  createThread: (body) => request('POST', '/api/threads', body),
  reply: (id, body) => request('POST', `/api/threads/${id}/posts`, body),
  deletePost: (id, password) => request('POST', `/api/posts/${id}/delete`, { password }),
  counter: () => request('POST', '/api/counter'),
};
