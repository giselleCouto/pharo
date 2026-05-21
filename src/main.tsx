import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ─── Seed da conta demo (executado antes do React montar) ──────
// Não usa o store Zustand — escreve direto no localStorage para
// garantir que o usuário demo exista antes do primeiro login.
function seedDemoAccount() {
  const DEMO_TENANT_ID = 'demo-pharos';
  const REGISTRY_KEY   = 'cab_tenant_registry';

  // Verifica se já existe
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    const lista: Array<{ id: string }> = raw ? JSON.parse(raw) : [];
    if (lista.some((t) => t.id === DEMO_TENANT_ID)) return; // já existe
  } catch {
    // continua para (re)criar
  }

  const agora = new Date().toISOString();
  const venc  = new Date();
  venc.setMonth(venc.getMonth() + 1);

  const demoTenant = {
    id: DEMO_TENANT_ID,
    nome_empresa: 'Demo Pharos',
    plano_id: 'PROFISSIONAL',
    plano_ativo: true,
    data_inicio: agora,
    data_vencimento: venc.toISOString(),
    cobranca_anual: false,
    uso_mensal: {
      mes: agora.slice(0, 7),
      otimizacoes_usadas: 0,
      ultimo_reset: agora,
    },
    usuarios: [
      {
        id: 'usr_demo_001',
        nome: 'Usuário Demo',
        email: 'demo@pharos.app',
        cargo: 'Analista de Logística',
        avatar_initials: 'UD',
        role: 'ADMIN',
        criado_em: agora,
      },
    ],
  };

  // Credencial: hash = btoa(encodeURIComponent(senha + '_cab2026'))
  // senha = 'demo123'  →  btoa(encodeURIComponent('demo123_cab2026'))
  const senhaHash = btoa(encodeURIComponent('demo123_cab2026'));

  try {
    // Salva tenant no registry
    const raw  = localStorage.getItem(REGISTRY_KEY);
    const lista = raw ? JSON.parse(raw) : [];
    lista.push(demoTenant);
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(lista));

    // Salva credencial
    const credKey = `cab_cred_${DEMO_TENANT_ID}_demo@pharos.app`;
    localStorage.setItem(credKey, senhaHash);

    console.info('[Pharos] Conta demo criada com sucesso.');
  } catch (e) {
    console.warn('[Pharos] Falha ao criar conta demo:', e);
  }
}

seedDemoAccount();

createRoot(document.getElementById("root")!).render(<App />);
