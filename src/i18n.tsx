import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'en' | 'hi';
type Messages = Record<string, string>;

const messages: Record<Language, Messages> = {
  en: {
    language: 'हिन्दी', languageLabel: 'Language', demo: 'Synthetic demo', server: 'Server workspace',
    navOverview: 'Network overview', navDriver: 'Driver simulator', navNotes: 'Validation notes',
    skip: 'Skip to dashboard', workspace: 'Workspace', reset: 'Reset demo', simulation: 'Simulation mode',
    synthetic: 'No live cameras or GPS. Synthetic observations only. Not for driving.', prototype: 'PROTOTYPE',
    network: 'Network intelligence', notMap: 'Directed road schematic · not a real map', driver: 'Driver simulator',
    overviewHeading: 'A clearer view of the road ahead.', driverHeading: 'Test the warning. Before the turn.', notesHeading: 'Evidence before action.',
    evidence: 'Evidence inspector', observation: 'Observation lab', submit: 'Submit observation',
    warnings: 'Vehicle {n} warnings', noHazards: 'No hazards in this warning zone', alertFailed: 'Alert calculation failed',
    upcoming: 'Only upcoming hazards on this vehicle’s directed route qualify.',
    animalRoad: 'Animal on road', animalIncident: 'Possible animal incident — review required',
    pothole: 'Pothole', hazardPresent: 'Hazard present (positive evidence)', explicitClear: 'Explicit clear (negative evidence)',
    languageButton: 'Switch to Hindi', languageButtonHindi: 'Switch to English',
  },
  hi: {
    language: 'हिन्दी', languageLabel: 'भाषा', demo: 'सिंथेटिक डेमो', server: 'सर्वर कार्यक्षेत्र',
    navOverview: 'नेटवर्क अवलोकन', navDriver: 'ड्राइवर सिम्युलेटर', navNotes: 'सत्यापन नोट्स',
    skip: 'डैशबोर्ड पर जाएँ', workspace: 'कार्यक्षेत्र', reset: 'डेमो रीसेट करें', simulation: 'सिमुलेशन मोड',
    synthetic: 'कोई लाइव कैमरा या GPS नहीं। केवल सिंथेटिक अवलोकन। ड्राइविंग के लिए नहीं।', prototype: 'प्रोटोटाइप',
    network: 'नेटवर्क जानकारी', notMap: 'निर्देशित सड़क रूपरेखा · वास्तविक मानचित्र नहीं', driver: 'ड्राइवर सिम्युलेटर',
    overviewHeading: 'आगे की सड़क का स्पष्ट दृश्य।', driverHeading: 'मोड़ से पहले चेतावनी जाँचें।', notesHeading: 'कार्रवाई से पहले साक्ष्य।',
    evidence: 'साक्ष्य निरीक्षक', observation: 'अवलोकन प्रयोगशाला', submit: 'अवलोकन जमा करें',
    warnings: 'वाहन {n} चेतावनियाँ', noHazards: 'इस चेतावनी क्षेत्र में कोई खतरा नहीं', alertFailed: 'चेतावनी गणना विफल',
    upcoming: 'केवल इस वाहन के निर्देशित मार्ग के आगे के खतरे शामिल हैं।',
    animalRoad: 'सड़क पर जानवर', animalIncident: 'संभावित पशु घटना — समीक्षा आवश्यक',
    pothole: 'गड्ढा', hazardPresent: 'खतरा मौजूद (सकारात्मक साक्ष्य)', explicitClear: 'स्पष्ट मार्ग (नकारात्मक साक्ष्य)',
     languageButton: 'अंग्रेज़ी पर जाएँ', languageButtonHindi: 'हिन्दी पर जाएँ',
  },
};

const STORAGE_KEY = 'roadguard.language';
const fallbackTranslate = (key: string, vars?: Record<string, string | number>) => {
  let result = messages.en[key] ?? key;
  Object.entries(vars ?? {}).forEach(([name, replacement]) => { result = result.replace(`{${name}}`, String(replacement)); });
  return result;
};
const Context = createContext<{ language: Language; setLanguage: (language: Language) => void; t: (key: string, vars?: Record<string, string | number>) => string }>({
  language: 'en', setLanguage: () => undefined, t: fallbackTranslate,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
  });
  const setLanguage = (next: Language) => { setLanguageState(next); try { localStorage.setItem(STORAGE_KEY, next); } catch { /* preference is optional */ } };
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key: string, vars?: Record<string, string | number>) => {
    let result = messages[language][key] ?? messages.en[key] ?? key;
    Object.entries(vars ?? {}).forEach(([name, replacement]) => { result = result.replace(`{${name}}`, String(replacement)); });
    return result;
  }}), [language]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);
