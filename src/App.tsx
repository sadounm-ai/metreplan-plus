import { useEffect, useState } from 'react';
import { BrandLogo } from './components/Brand';
import { Home } from './components/Home';
import { Workspace } from './components/Workspace';
import { useApp } from './store';

const fromHash = () => (location.hash.startsWith('#/projet/') ? location.hash.slice(9) : null);

export function App() {
  const [projectId, setProjectId] = useState<string | null>(fromHash());
  const data = useApp((s) => s.data);
  const { open, close, toast } = useApp.getState();

  useEffect(() => {
    const h = () => setProjectId(fromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    if (!projectId) {
      close();
      return;
    }
    open(projectId).catch((e) => {
      toast(`Ouverture impossible : ${e.message}`, 'erreur');
      location.hash = '';
    });
  }, [projectId]);

  if (!projectId) return <Home onOpen={(id) => (location.hash = `#/projet/${id}`)} />;
  if (!data || data.project.id !== projectId) return (
      <div className="loading-screen">
        <div>
          <BrandLogo height={90} />
          <p>Ouverture du projet…</p>
        </div>
      </div>
    );
  return <Workspace onHome={() => (location.hash = '')} />;
}
