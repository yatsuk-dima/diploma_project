import { create } from 'zustand';

const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,

  setAuth: (user, token) => set({ user, accessToken: token }),

  logout: () => {
    localStorage.removeItem('refresh_token');
    set({ user: null, accessToken: null });
  },
}));

export default useAuthStore;
