import client from './client';

export const listDisciplines = () => client.get('/api/disciplines').then(r => r.data);
export const createDiscipline = (body) => client.post('/api/disciplines', body).then(r => r.data);
export const updateDiscipline = (id, body) => client.put(`/api/disciplines/${id}`, body).then(r => r.data);
export const deleteDiscipline = (id) => client.delete(`/api/disciplines/${id}`);
export const addGroupToDiscipline = (discId, groupId) =>
  client.post(`/api/disciplines/${discId}/groups/${groupId}`);
export const removeGroupFromDiscipline = (discId, groupId) =>
  client.delete(`/api/disciplines/${discId}/groups/${groupId}`);
export const addInstructorToDiscipline = (discId, userId) =>
  client.post(`/api/disciplines/${discId}/instructors/${userId}`);
export const removeInstructorFromDiscipline = (discId, userId) =>
  client.delete(`/api/disciplines/${discId}/instructors/${userId}`);
