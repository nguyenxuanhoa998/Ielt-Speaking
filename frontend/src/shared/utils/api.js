'use strict';

const API = (() => {
  const BASE = '/api';

  async function request(method, path, body = null, isFormData = false) {
    const headers = Auth.getHeaders();
    if (isFormData) delete headers['Content-Type'];

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : null,
    });

    if (res.status === 401) { Auth.logout(); return null; }
    return res;
  }

  const get  = (path)         => request('GET',  path);
  const post = (path, body)   => request('POST', path, body);
  const postForm = (path, fd) => request('POST', path, fd, true);

  return { get, post, postForm, BASE };
})();
