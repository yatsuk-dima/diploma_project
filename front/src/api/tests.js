import client from './client';

export const listTests = (params) =>
  client.get('/api/tests', { params }).then((r) => r.data);

export const createTest = (data) =>
  client.post('/api/tests', data).then((r) => r.data);

export const getTest = (id) =>
  client.get(`/api/tests/${id}`).then((r) => r.data);

export const updateTest = (id, data) =>
  client.put(`/api/tests/${id}`, data).then((r) => r.data);

export const deleteTest = (id) =>
  client.delete(`/api/tests/${id}`);

export const publishTest = (id) =>
  client.post(`/api/tests/${id}/publish`).then((r) => r.data);

export const assignTest = (id, data) =>
  client.post(`/api/tests/${id}/assign`, data).then((r) => r.data);
