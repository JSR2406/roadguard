import { useState } from 'react';
import App from './App';
import LiveWorkspace from './LiveWorkspace';
import { I18nProvider, useI18n } from './i18n';
import './styles.css';

export default function Workspace() {
  return <I18nProvider><WorkspaceContent /></I18nProvider>;
}

function WorkspaceContent() {
  const [mode, setMode] = useState<'demo' | 'server'>('demo');
  const { language, setLanguage, t } = useI18n();
  return <><nav className="workspace-switch" aria-label="Data mode"><strong>RoadGuard</strong><button aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>{t('demo')}</button><button aria-pressed={mode === 'server'} onClick={() => setMode('server')}>{t('server')}</button><button className="language-switch" aria-label={t('languageLabel')} aria-pressed={language === 'hi'} onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}>{language === 'hi' ? 'English' : 'हिन्दी'}</button><span>Separate evidence stores · advisory pilot only</span></nav>{mode === 'demo' ? <App /> : <LiveWorkspace />}</>;
}
