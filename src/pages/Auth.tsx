import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTenantStore } from '@/hooks/useTenant';
import { PLANOS, PlanoId, formatarPreco } from '@/lib/tenant';
import { ROUTE_PATHS } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Eye, EyeOff, Building2, Mail, Lock, User, Briefcase,
  CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Crown
} from 'lucide-react';
import { PharosLogo } from '@/components/PharosLogo';
import { cn } from '@/lib/utils';
import {
  ensureDemoAccount,
  DEMO_TENANT_ID,
  DEMO_EMAIL,
  DEMO_SENHA,
  DEMO_LIMITE_OTIMIZACOES,
  getDemoTenant,
} from '@/lib/demoAccount';
import { PLANOS } from '@/lib/tenant';

type Modo = 'LOGIN' | 'REGISTRO';
type EtapaRegistro = 1 | 2 | 3;

const PLANOS_REGISTRO: PlanoId[] = ['STARTER', 'PROFISSIONAL', 'ENTERPRISE'];

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, registrar, erro, limparErro } = useTenantStore();

  const [modo, setModo] = useState<Modo>('LOGIN');

  useEffect(() => {
    const state = location.state as { modo?: Modo } | null;
    if (state?.modo === 'REGISTRO') {
      setModo('REGISTRO');
      setMsgErro('');
    }
  }, [location.state]);
  const [etapa, setEtapa] = useState<EtapaRegistro>(1);
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msgSucesso, setMsgSucesso] = useState('');
  const [msgErro, setMsgErro] = useState('');

  // Campos de login
  const [loginTenantId, setLoginTenantId] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');

  // Campos de registro
  const [regEmpresa, setRegEmpresa] = useState('');
  const [regCNPJ, setRegCNPJ] = useState('');
  const [regNome, setRegNome] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regCargo, setRegCargo] = useState('');
  const [regSenha, setRegSenha] = useState('');
  const [regConfSenha, setRegConfSenha] = useState('');
  const [regPlano, setRegPlano] = useState<PlanoId>('PROFISSIONAL');
  const [regAnual, setRegAnual] = useState(false);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMsgErro('');
    setLoading(true);
    const { ok, mensagem } = login(loginTenantId, loginEmail, loginSenha);
    setLoading(false);
    if (ok) navigate(ROUTE_PATHS.CONFIGURACAO);
    else setMsgErro(mensagem);
  }

  function entrarComDemo() {
    ensureDemoAccount();
    setLoginTenantId(DEMO_TENANT_ID);
    setLoginEmail(DEMO_EMAIL);
    setLoginSenha(DEMO_SENHA);
    setMsgErro('');
    setLoading(true);
    const { ok, mensagem } = login(DEMO_TENANT_ID, DEMO_EMAIL, DEMO_SENHA);
    setLoading(false);
    if (ok) {
      const fresh = getDemoTenant();
      if (fresh) useTenantStore.setState({ tenant: fresh });
      navigate(ROUTE_PATHS.CONFIGURACAO);
    } else {
      setMsgErro(mensagem);
    }
  }

  function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    setMsgErro('');
    if (etapa < 3) { setEtapa((etapa + 1) as EtapaRegistro); return; }
    if (regSenha !== regConfSenha) { setMsgErro('As senhas não coincidem.'); return; }
    if (regSenha.length < 6) { setMsgErro('Senha deve ter ao menos 6 caracteres.'); return; }
    setLoading(true);
    const { ok, mensagem } = registrar({
      nomeEmpresa: regEmpresa,
      cnpj: regCNPJ,
      nomeUsuario: regNome,
      email: regEmail,
      cargo: regCargo,
      senha: regSenha,
      plano_id: regPlano,
      cobranca_anual: regAnual,
    });
    setLoading(false);
    if (ok) navigate(ROUTE_PATHS.CONFIGURACAO);
    else setMsgErro(mensagem);
  }

  const planoSel = PLANOS[regPlano];
  const precoMostrar = regAnual ? planoSel.preco_anual_brl / 12 : planoSel.preco_mensal_brl;

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Painel esquerdo — hero ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[480px] shrink-0 p-10 relative overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #0a1628 0%, #0d2045 60%, #0a3060 100%)',
        }}
      >
        {/* Fundo abstrato */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute rounded-full border border-blue-400/40"
              style={{
                width: `${120 + i * 80}px`, height: `${120 + i * 80}px`,
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                animationDelay: `${i * 0.5}s`,
              }} />
          ))}
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <PharosLogo variant="full" fullClassName="h-11" />
          <p className="text-blue-300/70 text-xs font-mono mt-2">Otimizador de cabotagem v3.3</p>
        </div>

        {/* Conteúdo central */}
        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              Reduza custos.<br />
              <span className="text-blue-400">Otimize rotas.</span><br />
              Lucre mais.
            </h2>
            <p className="text-blue-200/70 mt-3 text-sm leading-relaxed">
              Algoritmo Inteligente multiparamétrico com 4 cenários simultâneos.
              Integração com qualquer cloud (AWS, Azure, GCP, Oracle). Heurística Pharos v3.3 de produção.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { val: '23%', desc: 'redução média de custo de combustível' },
              { val: '4×', desc: 'cenários otimizados em paralelo' },
              { val: '∞', desc: 'portos e navios no Enterprise' },
              { val: '100%', desc: 'isolamento de dados por empresa' },
            ].map(({ val, desc }) => (
              <div key={val} className="flex items-center gap-3">
                <div className="text-2xl font-bold text-blue-400 font-mono w-14 text-right">{val}</div>
                <div className="text-blue-200/60 text-xs">{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-blue-300/40 text-xs font-mono">
          © 2026 Pharos · Multitenant SaaS
        </div>
      </div>

      {/* ── Painel direito — formulário ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-6">

          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-4 lg:hidden">
              <PharosLogo variant="full" fullClassName="h-10" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              {modo === 'LOGIN' ? 'Acessar plataforma' : 'Criar conta gratuita'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {modo === 'LOGIN'
                ? 'Entre com as credenciais da sua empresa'
                : 'Comece agora com 14 dias de teste gratuito'}
            </p>
          </div>

          {/* Toggle modo */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              className={cn('flex-1 py-2.5 text-sm font-medium transition-all',
                modo === 'LOGIN' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
              onClick={() => { setModo('LOGIN'); setMsgErro(''); setEtapa(1); }}
            >Entrar</button>
            <button
              className={cn('flex-1 py-2.5 text-sm font-medium transition-all',
                modo === 'REGISTRO' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
              onClick={() => { setModo('REGISTRO'); setMsgErro(''); setEtapa(1); }}
            >Criar conta</button>
          </div>

          {/* Mensagem de erro */}
          {msgErro && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {msgErro}
            </div>
          )}
          {msgSucesso && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {msgSucesso}
            </div>
          )}

          {/* ── FORMULÁRIO DE LOGIN ── */}
          {modo === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                  ID da Empresa
                </label>
                <Input
                  value={loginTenantId} onChange={e => setLoginTenantId(e.target.value)}
                  placeholder="ex: petro-logistica"
                  className="font-mono"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  O ID foi enviado no e-mail de boas-vindas ao criar a conta.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  E-mail
                </label>
                <Input
                  type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="seu@email.com" required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  Senha
                </label>
                <div className="relative">
                  <Input
                    type={showSenha ? 'text' : 'password'}
                    value={loginSenha} onChange={e => setLoginSenha(e.target.value)}
                    placeholder="••••••••" required className="pr-10"
                  />
                  <button type="button" onClick={() => setShowSenha(!showSenha)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full gap-2" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar na plataforma'} <ArrowRight className="w-4 h-4" />
              </Button>

              {/* Demo rápido */}
              <div className="p-3 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">🎯 Conta demo ({PLANOS.DEMO.nome})</p>
                <p className="mb-2 text-[11px]">
                  Limite: <strong className="text-foreground">{DEMO_LIMITE_OTIMIZACOES} planos de cabotagem</strong>{' '}
                  (cada execução gera 4 cenários). Depois disso, crie uma conta e assine um plano.
                </p>
                <p>ID: <code className="bg-muted px-1 rounded">demo-pharos</code></p>
                <p>E-mail: <code className="bg-muted px-1 rounded">demo@pharos.app</code></p>
                <p>Senha: <code className="bg-muted px-1 rounded">demo123</code></p>
                <Button size="sm" variant="outline" className="mt-2 w-full text-xs h-7"
                  type="button"
                  disabled={loading}
                  onClick={entrarComDemo}>
                  Entrar com conta demo
                </Button>
              </div>
            </form>
          )}

          {/* ── FORMULÁRIO DE REGISTRO ── */}
          {modo === 'REGISTRO' && (
            <form onSubmit={handleRegistro} className="space-y-4">
              {/* Indicador de etapa */}
              <div className="flex items-center gap-2">
                {([1, 2, 3] as EtapaRegistro[]).map((e) => (
                  <div key={e} className={cn(
                    'flex-1 h-1.5 rounded-full transition-all',
                    etapa >= e ? 'bg-primary' : 'bg-muted'
                  )} />
                ))}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Etapa {etapa} de 3 — {etapa === 1 ? 'Empresa' : etapa === 2 ? 'Usuário Admin' : 'Plano'}
              </p>

              {/* Etapa 1: Empresa */}
              {etapa === 1 && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Nome da Empresa *</label>
                    <Input value={regEmpresa} onChange={e => setRegEmpresa(e.target.value)}
                      placeholder="Petro Logística S.A." required />
                    {regEmpresa && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        ID gerado: <span className="text-primary">{regEmpresa.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)}</span>
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">CNPJ (opcional)</label>
                    <Input value={regCNPJ} onChange={e => setRegCNPJ(e.target.value)}
                      placeholder="00.000.000/0001-00" />
                  </div>
                </div>
              )}

              {/* Etapa 2: Usuário Admin */}
              {etapa === 2 && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-muted-foreground" /> Nome completo *
                    </label>
                    <Input value={regNome} onChange={e => setRegNome(e.target.value)}
                      placeholder="Maria Silva" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" /> E-mail *
                    </label>
                    <Input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                      placeholder="admin@empresa.com" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-muted-foreground" /> Cargo *
                    </label>
                    <Input value={regCargo} onChange={e => setRegCargo(e.target.value)}
                      placeholder="Gerente de Logística" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Senha *</label>
                    <div className="relative">
                      <Input type={showSenha ? 'text' : 'password'}
                        value={regSenha} onChange={e => setRegSenha(e.target.value)}
                        placeholder="Mínimo 6 caracteres" required className="pr-10" />
                      <button type="button" onClick={() => setShowSenha(!showSenha)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Confirmar senha *</label>
                    <Input type="password" value={regConfSenha} onChange={e => setRegConfSenha(e.target.value)}
                      placeholder="Repetir senha" required />
                  </div>
                </div>
              )}

              {/* Etapa 3: Plano */}
              {etapa === 3 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Escolha seu plano</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn(!regAnual && 'text-primary font-semibold')}>Mensal</span>
                      <button type="button" onClick={() => setRegAnual(!regAnual)}
                        className={cn('w-10 h-5 rounded-full transition-colors relative',
                          regAnual ? 'bg-primary' : 'bg-muted border border-border')}>
                        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                          regAnual ? 'left-5' : 'left-0.5')} />
                      </button>
                      <span className={cn(regAnual && 'text-primary font-semibold')}>
                        Anual <Badge variant="outline" className="text-[9px] py-0 text-success border-success/30">−20%</Badge>
                      </span>
                    </div>
                  </div>

                  {PLANOS_REGISTRO.map((pid) => {
                    const pl = PLANOS[pid];
                    const preco = regAnual ? pl.preco_anual_brl / 12 : pl.preco_mensal_brl;
                    return (
                      <button key={pid} type="button"
                        onClick={() => setRegPlano(pid)}
                        className={cn(
                          'w-full text-left p-3 rounded-lg border-2 transition-all text-sm',
                          regPlano === pid
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/30'
                        )}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {pl.destaque && <Crown className="w-3.5 h-3.5 text-yellow-400" />}
                            <span className="font-semibold" style={{ color: pl.cor }}>{pl.nome}</span>
                            {pl.destaque && <Badge className="text-[9px] py-0 bg-yellow-400/20 text-yellow-400 border-yellow-400/30">Mais popular</Badge>}
                          </div>
                          <div className="text-right">
                            <div className="font-bold font-mono">{formatarPreco(preco)}<span className="text-xs text-muted-foreground font-normal">/mês</span></div>
                            {regAnual && <div className="text-[9px] text-success">Cobrado anualmente</div>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {pl.limite_otimizacoes_mes === 0 ? '∞' : pl.limite_otimizacoes_mes} otimizações/mês
                          · {pl.limite_usuarios === 0 ? '∞' : pl.limite_usuarios} usuários
                        </div>
                      </button>
                    );
                  })}
                  <p className="text-xs text-muted-foreground text-center">
                    14 dias grátis. Cancele a qualquer momento.
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                {etapa > 1 && (
                  <Button type="button" variant="outline" className="gap-1" onClick={() => setEtapa((etapa - 1) as EtapaRegistro)}>
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </Button>
                )}
                <Button type="submit" className="flex-1 gap-2" disabled={loading}>
                  {etapa < 3 ? 'Próximo' : loading ? 'Criando conta...' : 'Criar conta'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </form>
          )}

          <div className="text-center">
            <Link to={ROUTE_PATHS.LANDING} className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Voltar para o site
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
