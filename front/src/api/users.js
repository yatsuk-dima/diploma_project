import client from './client';

export const listUsers = (params) =>
  client.get('/api/users', { params }).then((r) => r.data);

export const createUser = (data) =>
  client.post('/api/users', data).then((r) => r.data);

export const updateUser = (id, data) =>
  client.put(`/api/users/${id}`, data).then((r) => r.data);

export const deleteUser = (id) =>
  client.delete(`/api/users/${id}`);

export const bulkCreateUsers = (file) => {
  const form = new FormData();
  form.append('file', file);
  return client.post('/api/users/bulk', form).then((r) => r.data);
};
