# Cabotagem Otimizador v3.3

Sistema de suporte à decisão (DSS) para planejamento de rotas multi-porto e gestão de frota de cabotagem, com horizonte de planejamento de até dois meses. Integra restrições operacionais (calado, maré, janelas de ressuprimento, segregação de produtos) e modelos de custo (bunker, TC, SPOT, demurrage).

## Stack tecnológica

- **Vite** — build e dev server
- **TypeScript** — tipagem estrita
- **React 18** — interface
- **shadcn-ui** + **Tailwind CSS** — componentes e estilo
- **Zustand** — estado global e multitenancy (localStorage por tenant)
- **Web Workers** — motor de otimização fora da thread principal

## Funcionalidades principais

- Otimização heurística multi-porto com **4 cenários** (Otimista, Base, Conservador, Custo Mínimo)
- Motor de marés com síntese harmônica local (offline) e suporte opcional à WorldTides API
- Validação de calado (UKC) por porto e data
- Agrupamento estratégico de demandas, janelas de ressuprimento e sequenciamento de portos
- Exportação JSON tipo API (metaheurística `multi_porto_heuristica_v3.3`)

## Pré-requisitos

- Node.js 18+
- npm (ou pnpm)

## Instalação e execução

```bash
# Instalar dependências
npm install

# Servidor de desenvolvimento (http://localhost:8080)
npm run dev

# Build de produção
npm run build

# Pré-visualizar build
npm run preview
```

## Scripts úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o Vite em modo desenvolvimento |
| `npm run build` | Gera o bundle em `dist/` |
| `npm run lint` | Executa o ESLint |
| `npm run test:edge-functions` | Testes das edge functions Supabase (Deno) |

### Verificação de tipos

```bash
npx tsc --noEmit -p tsconfig.app.json --strict
```

## Estrutura do projeto

```
src/
├── api/              # Integrações com backend / Supabase
├── components/       # Componentes de UI (incl. shadcn)
├── data/             # Dados mock e configuração padrão
├── hooks/            # Hooks React (otimizador, tenant, etc.)
├── lib/
│   ├── optimizer/    # Módulos do motor (ordenação, custos, restrições)
│   ├── optimizer.ts
│   ├── optimizer.worker.ts
│   ├── tideEngine.ts # Previsão de maré (client-side)
│   ├── mare.ts       # Calado efetivo e previsões
│   └── types.ts
└── pages/            # Páginas da aplicação
```

## Fluxo de desenvolvimento

1. Ajuste o tema em `src/index.css` conforme a identidade visual desejada.
2. Defina as páginas necessárias e crie pastas em `src/pages/` com `Index.tsx` como entrada.
3. Registre as rotas em `src/App.tsx`.
4. Para páginas simples, implemente tudo em `Index.tsx`; para páginas complexas, organize em:
   - `Index.tsx` — entrada
   - `components/` — componentes da página
   - `hooks/` — lógica reutilizável
   - `stores/` — estado compartilhado (Zustand), se necessário
5. Antes de concluir, rode `npm run lint` e a verificação TypeScript acima.

## Integração com backend

- Novas APIs ou operações Supabase devem ser criadas em `src/api/`, exportando os tipos correspondentes (veja `src/api/demo.ts` como referência).
- Mantenha os tipos em `src/lib/types.ts` como fonte da verdade; ao alterá-los, revise todos os arquivos que os importam.
- Edge functions ficam em `supabase/edge_function/`.

## Motor de otimização (v3.3)

O algoritmo roda no **Web Worker** (`optimizer.worker.ts`) e utiliza:

| Módulo | Responsabilidade |
|--------|------------------|
| `ordering.ts` | Agrupamento por porto, janelas de ressuprimento, faixas temporais, sequência de portos |
| `costs.ts` | Bunker (FULL/ECO/MIN), TC/SPOT, demurrage |
| `constraints.ts` | Calado, maré harmônica, segregação de produtos |

Na interface: **Configuração** → **Otimização** → **Resultados**.

> **Nota:** Com os dados mock padrão, o cenário **Otimista** tende a gerar viagens; cenários com ocupação mínima mais alta (Base/Conservador) podem não atingir o limite de ocupação com volumes pequenos — ajuste demandas ou premissas em Configuração.

## Repositório

Código publicado em: [github.com/giselleCouto/pharo](https://github.com/giselleCouto/pharo)

## Licença

Projeto privado. Uso restrito conforme acordado com os mantenedores.
