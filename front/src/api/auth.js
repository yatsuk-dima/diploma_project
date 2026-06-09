import client from './client';
import axios from 'axios';

export const login = (login, password) =>
  axios.post('/api/auth/login', { login, password }).then((r) => r.data);

export const refresh = (refreshToken) =>
  axios.post('/api/auth/refresh', { refresh_token: refreshToken }).then((r) => r.data);

export const logout = (refreshToken) =>
  client.post('/api/auth/logout', { refresh_token: refreshToken });

export const me = () => client.get('/api/auth/me').then((r) => r.data);
