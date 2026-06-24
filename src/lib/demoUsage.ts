/** Contador de otimizações da conta demo compartilhada — isolado por navegador. */

export const DEMO_USO_BROWSER_KEY = 'cab_demo_uso_browser';

/** Limite de execuções do motor na conta demo compartilhada (por navegador). */
export const DEMO_LIMITE_BROWSER = 5;

export function getDemoUsoBrowser(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(DEMO_USO_BROWSER_KEY);
    return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

export function incrementDemoUsoBrowser(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEMO_USO_BROWSER_KEY, String(getDemoUsoBrowser() + 1));
}

export function podeDemoBrowser(): { pode: boolean; restam: number; usadas: number } {
  const usadas = getDemoUsoBrowser();
  const restam = DEMO_LIMITE_BROWSER - usadas;
  return { pode: restam > 0, restam: Math.max(0, restam), usadas };
}
