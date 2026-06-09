import client from './client';

export const listPending = (params) =>
  client.get('/api/review/pending', { params }).then((r) => r.data);

export const submitReview = (answerId, data) =>
  client.post(`/api/review/answers/${answerId}`, data).then((r) => r.data);
