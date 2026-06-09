import client from './client';

export const listQuestions = (testId) =>
  client.get(`/api/tests/${testId}/questions`).then((r) => r.data);

export const createQuestion = (testId, data) =>
  client.post(`/api/tests/${testId}/questions`, data).then((r) => r.data);

export const updateQuestion = (id, data) =>
  client.put(`/api/questions/${id}`, data).then((r) => r.data);

export const deleteQuestion = (id) =>
  client.delete(`/api/questions/${id}`);

export const patchDifficulty = (id, override) =>
  client
    .patch(`/api/questions/${id}/difficulty`, { override })
    .then((r) => r.data);
