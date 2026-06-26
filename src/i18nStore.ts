import { create } from "zustand";

export type Language = "de" | "en";

const STORAGE_KEY = "dove_language";

function getStoredLanguage(): Language {
  return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "de";
}

interface I18nState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  language: getStoredLanguage(),
  setLanguage: (language) => {
    localStorage.setItem(STORAGE_KEY, language);
    set({ language });
  },
}));
