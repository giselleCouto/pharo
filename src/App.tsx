import { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/types';
import { Layout } from '@/components/Layout';
import { AuthGuard } from '@/components/AuthGuard';
import { useTenantStore } from '@/hooks/useTenant';
import { ensureDemoAccount, DEMO_TENANT_ID, getDemoTenant } from '@/lib/demoAccount';
import LandingPage from '@/pages/Landing';
import AuthPage from '@/pages/Auth';
import ConfiguracaoPage from '@/pages/Configuracao';
import OtimizacaoPage from '@/pages/Otimizacao';
import ResultadosPage from '@/pages/Resultados';
import PlanosPage from '@/pages/Planos';

function App() {
  useEffect(() => {
    ensureDemoAccount();
    const markHydrated = () => {
      const state = useTenantStore.getState();
      if (state.sessao?.tenant_id === DEMO_TENANT_ID) {
        const fresh = getDemoTenant();
        if (fresh) useTenantStore.setState({ tenant: fresh });
      }
      useTenantStore.setState({ _hasHydrated: true });
    };
    if (useTenantStore.persist.hasHydrated()) {
      markHydrated();
    }
    return useTenantStore.persist.onFinishHydration(markHydrated);
  }, []);

  return (
    <Router>
      <Routes>
        {/* Públicas */}
        <Route path={ROUTE_PATHS.LANDING} element={<LandingPage />} />
        <Route path={ROUTE_PATHS.AUTH} element={<AuthPage />} />

        {/* Protegidas — exigem autenticação */}
        <Route path={ROUTE_PATHS.CONFIGURACAO} element={
          <AuthGuard><Layout><ConfiguracaoPage /></Layout></AuthGuard>
        } />
        <Route path={ROUTE_PATHS.OTIMIZACAO} element={
          <AuthGuard><Layout><OtimizacaoPage /></Layout></AuthGuard>
        } />
        <Route path={ROUTE_PATHS.RESULTADOS} element={
          <AuthGuard><Layout><ResultadosPage /></Layout></AuthGuard>
        } />
        <Route path={ROUTE_PATHS.PLANOS} element={
          <AuthGuard><Layout><PlanosPage /></Layout></AuthGuard>
        } />

        <Route path="*" element={<Navigate to={ROUTE_PATHS.LANDING} replace />} />
      </Routes>
    </Router>
  );
}

export default App;
