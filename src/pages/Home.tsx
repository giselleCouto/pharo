import { Link } from 'react-router-dom';
import { ROUTE_PATHS } from '@/lib/types';
import { Ship, Settings, Zap, BarChart3, Anchor, ArrowRight, Package, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { motion } from 'framer-motion';

export default function HomePage() {
  const steps = [
    {
      icon: Settings,
      title: 'Configuração',
      desc: 'Defina portos (lat/lng), navios (TC/SPOT), demandas por porto e premissas operacionais.',
      link: ROUTE_PATHS.CONFIGURACAO,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      icon: Zap,
      title: 'Otimização',
      desc: 'Execute os 4 cenários: Otimista, Base, Conservador e Otimizador de Custo.',
      link: ROUTE_PATHS.OTIMIZACAO,
      color: 'text-warning',
      bg: 'bg-warning/10',
    },
    {
      icon: BarChart3,
      title: 'Resultados',
      desc: 'Analise rotas, custos (TC, bunker, portuário), mapa e JSON de saída API Routes type 4.',
      link: ROUTE_PATHS.RESULTADOS,
      color: 'text-success',
      bg: 'bg-success/10',
    },
  ];

  const features = [
    { icon: Ship, label: 'Navios TC e SPOT', desc: 'Suporte a contratos Time Charter e SPOT' },
    { icon: MapPin, label: 'Multi-porto', desc: 'Até 5 portos por viagem' },
    { icon: Package, label: 'Fracionamento', desc: 'Divide demandas por navio e capacidade' },
    { icon: Anchor, label: 'Calado', desc: 'Restrições de calado por porto' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--primary) 8%, transparent), transparent 70%)'
        }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="max-w-3xl"
        >
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20"
              style={{ boxShadow: '0 0 30px -4px color-mix(in srgb, var(--primary) 25%, transparent)' }}>
              <Ship className="w-10 h-10 text-primary" />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Otimizador de Rotas de{' '}
            <span className="text-primary">Cabotagem</span>
          </h1>
          <p className="text-lg text-muted-foreground mb-2 max-w-2xl mx-auto">
            Módulo de Adaptação para Modelo de Otimização — Produção v2.0
          </p>
          <p className="text-sm text-muted-foreground mb-10 max-w-2xl mx-auto">
            Calcule cenários de roteirização multi-porto com navios TC e SPOT, respeitando
            restrições de calado, janelas de ressuprimento e minimizando custos operacionais.
          </p>

          <div className="flex items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2 font-semibold"
              style={{ boxShadow: '0 4px 20px color-mix(in srgb, var(--primary) 35%, transparent)' }}>
              <Link to={ROUTE_PATHS.CONFIGURACAO}>
                <Settings className="w-4 h-4" />
                Iniciar Configuração
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link to={ROUTE_PATHS.OTIMIZACAO}>
                <Zap className="w-4 h-4" />
                Executar Otimização
              </Link>
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Steps */}
      <div className="px-6 pb-12 max-w-5xl mx-auto w-full">
        <h2 className="text-center text-sm font-mono text-muted-foreground mb-6 uppercase tracking-wider">Fluxo de Trabalho</h2>
        <div className="grid grid-cols-3 gap-4">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
            >
              <Link to={step.link}>
                <Card className="border-border bg-card hover:border-primary/30 transition-all duration-200 cursor-pointer group"
                  style={{ boxShadow: '0 4px 20px -4px color-mix(in srgb, var(--primary) 6%, transparent)' }}>
                  <CardContent className="pt-5 pb-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2 rounded-lg ${step.bg}`}>
                        <step.icon className={`w-5 h-5 ${step.color}`} />
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">PASSO {i + 1}</div>
                    </div>
                    <h3 className="font-bold mb-1.5 group-hover:text-primary transition-colors">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-4 gap-3">
          {features.map((feat, i) => (
            <motion.div
              key={feat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 + i * 0.05 }}
              className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/50 text-sm"
            >
              <feat.icon className="w-4 h-4 text-primary flex-shrink-0" />
              <div>
                <div className="font-medium text-xs">{feat.label}</div>
                <div className="text-muted-foreground text-[11px]">{feat.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
