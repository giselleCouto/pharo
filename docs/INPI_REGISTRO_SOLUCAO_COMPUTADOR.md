# REGISTRO DE PROGRAMA DE COMPUTADOR — INPI

**Documento auxiliar para depósito de Solução de Computador (Programa de Computador)**  
**Sistema:** Pharos — Otimizador de Cabotagem  
**Versão:** 3.3  
**Data do documento:** 26/05/2026  

---

> **Aviso:** Este material é um modelo técnico-descritivo para apoio ao pedido no INPI. A petição oficial deve ser protocolada pelo titular ou por procurador habilitado no sistema **e-INPI**, com recolhimento de GRU e documentos exigidos na data do protocolo. Consulte o Manual de Programa de Computador do INPI e a legislação vigente (Lei nº 9.609/1998 e Decreto nº 2.556/1998).

---

## 1. Identificação do programa

| Campo | Informação |
|-------|------------|
| **Título do programa** | Pharos — Otimizador de Cabotagem |
| **Nome alternativo / marca** | Pharos |
| **Versão** | 3.3 |
| **Tipo** | Programa de computador (Solução de Computador) |
| **Natureza** | Aplicação web de suporte à decisão (DSS) para logística marítima de cabotagem |
| **Linguagens de programação** | TypeScript, TSX (React), Python (módulo auxiliar de marés) |
| **Ambiente de execução** | Navegador web (client-side); build com Node.js 18+ e Vite 5 |
| **Sistema operacional alvo** | Multiplataforma (Windows, Linux, macOS) via navegador |
| **Data de criação** | *[preencher: DD/MM/AAAA]* |
| **País de origem** | Brasil |
| **Campo de aplicação** | Transporte marítimo de cabotagem; planejamento operacional de rotas; gestão de frota (Time Charter e SPOT); otimização de custos logísticos |

---

## 2. Titularidade e autoria

### 2.1 Titular do direito

| Campo | Informação |
|-------|------------|
| **Nome / Razão social** | *[preencher]* |
| **CPF / CNPJ** | *[preencher]* |
| **Nacionalidade** | *[preencher]* |
| **Endereço completo** | *[preencher]* |
| **E-mail** | *[preencher]* |

### 2.2 Autor(es) do programa

| # | Nome completo | CPF | Nacionalidade | Vínculo com o titular |
|---|---------------|-----|---------------|------------------------|
| 1 | *[preencher]* | *[preencher]* | *[preencher]* | *[criador / empregado / cessionário]* |

*Se houver mais autores, reproduza a tabela.*

### 2.3 Declaração de autoria (modelo)

Declaro, sob as penas da lei, que sou autor do programa de computador identificado neste documento, ou que detenho legitimidade para requerer o registro em nome do titular indicado, e que o programa é original, não constituindo reprodução não autorizada de obra de terceiros.

Local: _______________________  
Data: ____/____/2026  

Assinatura do titular ou representante legal: _______________________

---

## 3. Resumo executivo

O **Pharos** é um sistema de suporte à decisão para **planejamento e otimização de rotas multi-porto** em operações de **cabotagem marítima**, com horizonte de planejamento configurável (até aproximadamente dois meses). O software integra restrições operacionais reais — calado, maré, janelas de ressuprimento, segregação de produtos, capacidade de porões e tipos de navio (TC/SPOT) — e calcula **quatro cenários simultâneos** de roteirização (Otimista, Base, Conservador e Custo Mínimo), executados em **Web Worker** para não bloquear a interface.

A arquitetura é **multitenant**: cada empresa (tenant) possui isolamento de configuração, credenciais, histórico de uso e limites de plano (demonstração, Starter, Profissional, Enterprise). O motor heurístico identificado internamente como `multi_porto_heuristica_v3.3` produz viagens, paradas, métricas de custo (bunker, TC, portuário, demurrage SPOT) e saída estruturada em JSON compatível com integração API.

---

## 4. Descrição funcional detalhada

### 4.1 Objetivo

Automatizar e qualificar a decisão de **sequenciamento de portos**, **alocação de demandas** a navios e **avaliação de cenários econômico-operacionais**, reduzindo custo de bunker e riscos de inviabilidade por calado ou janela de operação.

### 4.2 Módulos principais

| Módulo | Arquivo(s) principal(is) | Função |
|--------|--------------------------|--------|
| **Interface e rotas** | `src/App.tsx`, `src/pages/*` | Navegação, autenticação, configuração, otimização, resultados e planos |
| **Multitenancy e planos** | `src/lib/tenant.ts`, `src/hooks/useTenant.ts` | Registro, login, isolamento por empresa, limites de uso mensal |
| **Motor de otimização** | `src/lib/optimizer.ts`, `src/lib/optimizer.worker.ts` | Orquestração dos 4 cenários em thread separada |
| **Ordenação e sequência** | `src/lib/optimizer/ordering.ts` | Agrupamento de demandas, sequência de portos, janelas de ressuprimento |
| **Custos** | `src/lib/optimizer/costs.ts` | Bunker por velocidade (FULL/ECO/MIN), TC, demurrage SPOT |
| **Restrições** | `src/lib/optimizer/constraints.ts` | Calado, elegibilidade de navio, segregação de produtos |
| **Marés e calado** | `src/lib/mare.ts`, `src/lib/tideEngine.ts`, `src/lib/tide_engine.py` | Previsão de maré, janelas de calado, validação UKC |
| **Tipos e contratos** | `src/lib/types.ts` | Modelagem de domínio (portos, navios, demandas, viagens) |
| **Visualização** | `src/components/GanttChart.tsx`, `TideCalendar.tsx` | Cronograma de viagens e calendário de marés |
| **Conta demonstração** | `src/lib/demoAccount.ts` | Ambiente de avaliação com limite de execuções |

### 4.3 Fluxo operacional do usuário

1. **Cadastro / login** — criação de tenant ou acesso demo.  
2. **Configuração** — cadastro de portos (coordenadas, calado, janelas), navios (TC/SPOT, consumo, capacidade), demandas e premissas.  
3. **Otimização** — disparo do motor; progresso em tempo real; contagem de uso conforme plano.  
4. **Resultados** — comparação de cenários, mapa, Gantt, exportação JSON.  
5. **Planos** — gestão de assinatura e limites (em ambiente de demonstração, upgrade para conta paga).

### 4.4 Algoritmo e diferenciais técnicos

- Heurística **multi-porto** com fracionamento de demandas e rotação de frota.  
- Execução **paralela de quatro cenários** com parâmetros distintos de ocupação e conservadorismo.  
- Integração de **maré** para restrição de calado em janelas viáveis.  
- Modelagem de **bunker** por perfil de velocidade do navio.  
- **Isolamento multitenant** em armazenamento local (preparado para backend em nuvem).  
- Metaheurística registrada na saída: `multi_porto_heuristica_v3.3`.

### 4.5 Dependências de terceiros (runtime)

React 18, Vite 5, Zustand, React Router, Tailwind CSS, componentes Radix/shadcn, Framer Motion, entre outras listadas em `package.json`. O registro refere-se à **obra desenvolvida pelo titular** (código em `src/` e arquivos de configuração listados no hash), não às bibliotecas de terceiros em `node_modules`.

---

## 5. Estrutura do depósito (código-fonte)

O depósito lógico para fins de hash e descrição compreende:

- Diretório `src/` (código TypeScript/TSX/Python da aplicação)
- Arquivos raiz: `index.html`, `package.json`, `vite.config.ts`, `tsconfig*.json`

**Excluídos do hash de referência:** `node_modules/`, `dist/`, `.git/`, assets binários de imagem em `public/` (favicon e logo podem ser anexados separadamente ao INPI se exigido).

Lista completa dos **94 arquivos** considerados no hash: ver anexo `INPI_HASH_SOLUCAO.json` (campo `arquivos_lista`).

---

## 6. Hash criptográfico da solução (SHA-256)

Valores gerados em **01/06/2026** (UTC; ver `INPI_HASH_SOLUCAO.json` para timestamp exato). Para regenerar após alterações no código:

```bash
node scripts/generate-inpi-hash.mjs
```

| Campo | Valor |
|-------|-------|
| **Algoritmo** | SHA-256 |
| **Arquivos incluídos** | 94 |
| **Volume total** | 554.266 bytes (~541 KiB) |
| **HASH SHA-256** | `323efc854215e52053d95a89712f73d6e03c756aa8e59e38eb830670c342504f` |

### 6.1 Metodologia de cálculo

Para cada arquivo fonte, em **ordem lexicográfica crescente** do caminho relativo (normalizado com `/`):

1. Concatena-se o caminho relativo em UTF-8;  
2. Concatena-se o byte `0x0A` (LF);  
3. Concatena-se o conteúdo bruto do arquivo;  
4. Aplica-se SHA-256 sobre o buffer resultante da concatenação de todos os arquivos.

Esta metodologia permite verificação independente e reprodução do mesmo hash em ambiente controlado.

### 6.2 Uso no formulário INPI

No campo **resumo digital do programa de computador** (hash), informe:

```
323efc854215e52053d95a89712f73d6e03c756aa8e59e38eb830670c342504f
```

*Confirme no momento do protocolo se o sistema solicita SHA-256 em minúsculas ou maiúsculas; o valor acima está em **hexadecimal minúsculo**.*

---

## 7. Informações para o formulário e-INPI (checklist)

- [ ] Título: **Pharos — Otimizador de Cabotagem**  
- [ ] Versão: **3.3**  
- [ ] Linguagem: **TypeScript / JavaScript (React)**  
- [ ] Campo de aplicação: **Logística e transporte marítimo — cabotagem**  
- [ ] Hash SHA-256: ver seção 6  
- [ ] Anexar PDF deste documento (ou trechos exigidos) se necessário  
- [ ] Anexar trechos de código-fonte ou mídia conforme orientação do INPI na data do pedido  
- [ ] GRU paga e comprovante anexado  
- [ ] Procuração (se aplicável)  

---

## 8. Histórico de versões documentadas

| Versão | Data | Observação |
|--------|------|------------|
| 3.3 | 2026 | Heurística multi-porto integrada; maré; multitenant; conta demo com limite |
| — | — | Versões anteriores: *[preencher se houver]* |

---

## 9. Anexos deste pacote

| Arquivo | Descrição |
|---------|-----------|
| `docs/INPI_REGISTRO_SOLUCAO_COMPUTADOR.md` | Este documento |
| `docs/INPI_HASH_SOLUCAO.txt` | Hash e metadados em texto simples |
| `docs/INPI_HASH_SOLUCAO.json` | Hash, data, lista de arquivos e bytes |
| `scripts/generate-inpi-hash.mjs` | Script de regeneração do hash |

---

## 10. Contato técnico (opcional)

| Campo | Informação |
|-------|------------|
| **Responsável técnico** | *[preencher]* |
| **Repositório** | https://github.com/giselleCouto/pharo.git |
| **E-mail** | *[preencher]* |

---

*Documento gerado para fins de registro de Programa de Computador no INPI — Pharos v3.3.*
