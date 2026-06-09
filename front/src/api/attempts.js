import client from './client';

export const startAttempt = (testId) =>
  client.post('/api/attempts', { test_id: testId }).then((r) => r.data);

export const getAttemptState = (id) =>
  client.get(`/api/attempts/${id}`).then((r) => r.data);

export const getNextQuestion = (id) =>
  client.get(`/api/attempts/${id}/next`).then((r) => r.data);

export const submitAnswer = (id, data) =>
  client.post(`/api/attempts/${id}/answer`, data).then((r) => r.data);

export const finishAttempt = (id) =>
  client.post(`/api/attempts/${id}/finish`).then((r) => r.data);

export const getAttemptResult = (id) =>
  client.get(`/api/attempts/${id}/result`).then((r) => r.data);

export const myAttempts = (params) =>
  client.get('/api/attempts/my', { params }).then((r) => r.data);
