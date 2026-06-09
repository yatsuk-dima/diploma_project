import client from './client';

export const listGroups = () =>
  client.get('/api/groups').then((r) => r.data);

export const createGroup = (data) =>
  client.post('/api/groups', data).then((r) => r.data);

export const updateGroup = (id, data) =>
  client.put(`/api/groups/${id}`, data).then((r) => r.data);

export const deleteGroup = (id) =>
  client.delete(`/api/groups/${id}`);

export const listGroupStudents = (groupId) =>
  client.get(`/api/groups/${groupId}/students`).then((r) => r.data);
