import client from './client';

export const getOverview = () =>
  client.get('/api/analytics/overview').then((r) => r.data);

export const getStudentAnalytics = (id, params) =>
  client.get(`/api/analytics/students/${id}`, { params }).then((r) => r.data);

export const getGroupAnalytics = (id, params) =>
  client.get(`/api/analytics/groups/${id}`, { params }).then((r) => r.data);

export const getTestAnalytics = (id, params) =>
  client.get(`/api/analytics/tests/${id}`, { params }).then((r) => r.data);

export const getTestQuestionStats = (id) =>
  client.get(`/api/analytics/tests/${id}/questions`).then((r) => r.data);
