import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Crown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ROUTE_PATHS } from '@/lib/types';
import { isPlanoDemo, isPlanoTrial } from '@/lib/tenant';
import type { Tenant } from '@/lib/tenant';

interface LimitePlanoAlertProps {
  tenant: Tenant;
  motivo: string;
  className?: string;
}

export function LimitePlanoAlert({ tenant, motivo, className = '' }: LimitePlanoAlertProps) {
  const navigate = useNavigate();
  const demo = isPlanoDemo(tenant);
  const trial = isPlanoTrial(tenant);

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 ${className}`}
    >
      <div className="flex items-start gap-2 text-destructive">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <span className="text-sm font-medium">{motivo}</span>
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {demo ? (
          <>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(ROUTE_PATHS.AUTH, { state: { modo: 'REGISTRO' } })}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Criar conta gratuita
            </Button>
            <Link to={ROUTE_PATHS.PLANOS}>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Crown className="w-3.5 h-3.5" />
                Ver planos
              </Button>
            </Link>
          </>
        ) : trial ? (
          <Link to={ROUTE_PATHS.PLANOS}>
            <Button
              size="sm"
              className="gap-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive border border-destructive/30"
            >
              <Crown className="w-3.5 h-3.5" />
              Assinar plano
            </Button>
          </Link>
        ) : (
          <Link to={ROUTE_PATHS.PLANOS}>
            <Button
              size="sm"
              className="gap-1.5 bg-destructive/20 hover:bg-destructive/30 text-destructive border border-destructive/30"
            >
              <Crown className="w-3.5 h-3.5" />
              Fazer upgrade
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
