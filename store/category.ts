import { create } from 'zustand';
interface State {
  activeId: number;
  scrollSpyLockedUntil: number;
  setActiveId: (activeId: number) => void;
  setActiveIdFromClick: (activeId: number) => void;
}

const SCROLL_SPY_CLICK_LOCK_MS = 1200;

export const useCategoryStore = create<State>((set) => ({
  activeId: 1,
  scrollSpyLockedUntil: 0,
  setActiveId: (activeId: number) => {
    set((state) =>
      Date.now() < state.scrollSpyLockedUntil ? state : { activeId }
    );
  },
  setActiveIdFromClick: (activeId: number) => {
    set({
      activeId,
      scrollSpyLockedUntil: Date.now() + SCROLL_SPY_CLICK_LOCK_MS,
    });
  },
}));
