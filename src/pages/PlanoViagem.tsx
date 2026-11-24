import { Compass } from 'lucide-react';
import { useOtimizadorStore } from '@/hooks/useOtimizador';
import { PainelPlanoViagem } from '@/components/plano-viagem/PainelPlanoViagem';

export default function PlanoViagemPage() {
  const { configuracao } = useOtimizadorStore();
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Compass className="w-6 h-6 text-primary" />
          Plano de Viagem
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Rota costeira por waypoints entre portos do catálogo, com velocidade e ETA por perna, exportada em RTZ (IEC 61174) para o ECDIS.
          Para planejar as pernas de uma viagem otimizada, use a aba “Plano de Viagem” em Resultados.
        </p>
      </div>
      <PainelPlanoViagem portos={configuracao.portos} navios={configuracao.navios} />
    </div>
  );
}
