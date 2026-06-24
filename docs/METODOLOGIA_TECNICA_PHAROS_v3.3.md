# Pharos v3.3 — Documento Técnico de Metodologia

**Sistema:** Pharos — Otimizador de Cabotagem  
**Versão:** 3.3  
**Metaheurística:** `multi_porto_heuristica_v3.3`  
**Data do documento:** Junho/2026  

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Arquitetura e fluxo de dados](#2-arquitetura-e-fluxo-de-dados)
3. [Modelo de domínio](#3-modelo-de-domínio)
4. [Motor de marés](#4-motor-de-marés)
5. [Calado, UKC e cruzamento com maré](#5-calado-ukc-e-cruzamento-com-maré)
6. [Modelagem de carga](#6-modelagem-de-carga)
7. [Modelos de custo](#7-modelos-de-custo)
8. [Restrições operacionais](#8-restrições-operacionais)
9. [Heurística de otimização multi-porto](#9-heurística-de-otimização-multi-porto)
10. [Cenários de planejamento](#10-cenários-de-planejamento)
11. [Cronograma e simulação temporal](#11-cronograma-e-simulação-temporal)
12. [Métricas e saída](#12-métricas-e-saída)
13. [Limitações conhecidas e evoluções](#13-limitações-conhecidas-e-evoluções)
14. [Referências de implementação](#14-referências-de-implementação)

---

## 1. Visão geral

O **Pharos** é um **Sistema de Suporte à Decisão (DSS)** para planejamento operacional de **cabotagem marítima multi-porto**, com horizonte configurável (tipicamente até ~60 dias). O objetivo é automatizar a construção de **planos de viagem** que:

- Atendem demandas de carga em múltiplos portos;
- Respeitam restrições de **calado**, **maré (UKC)**, **capacidade**, **segregação de produtos** e **janelas de ressuprimento**;
- Estimam **custos operacionais** (bunker, hire TC, SPOT, demurrage, portuário, reefer);
- Produzem **quatro cenários comparáveis** em paralelo para apoiar a decisão comercial e operacional.

A abordagem não é um solver de programação linear/inteira exato, e sim uma **heurística construtiva greedy** com validação de restrições, executada no **Web Worker** do navegador para não bloquear a interface.

---

## 2. Arquitetura e fluxo de dados

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  Configuração   │────▶│ optimizer.worker │────▶│ 4 × executarOtimizacao  │
│  (UI + store)   │     │  (thread isolada)│     │ (OTIMISTA…CUSTO_MINIMO) │
└─────────────────┘     └──────────────────┘     └───────────┬─────────────┘
         │                          │                         │
         │                          │                         ▼
         ▼                          ▼              ┌─────────────────────┐
┌─────────────────┐     ┌──────────────────┐     │ Resultados + JSON   │
│ tideEngine.ts   │     │ constraints.ts   │     │ Gantt / Mapa / API  │
│ mare.ts         │     │ costs.ts         │     └─────────────────────┘
│ ordering.ts     │     │ cargo.ts         │
└─────────────────┘     └──────────────────┘
```

**Módulos principais:**

| Módulo | Arquivo | Função |
|--------|---------|--------|
| Orquestração | `src/lib/optimizer.ts` | Loop principal de alocação de demandas, viagens e métricas |
| Ordenação | `src/lib/optimizer/ordering.ts` | Priorização de demandas, sequência de portos, janelas de ressuprimento |
| Custos | `src/lib/optimizer/costs.ts` | Bunker, TC, SPOT, demurrage, reefer |
| Restrições | `src/lib/optimizer/constraints.ts` | Calado, maré, segregação IMDG/produto |
| Carga | `src/lib/optimizer/cargo.ts` | CBM/TEU, peso, reefer, fracionamento |
| Maré | `src/lib/tideEngine.ts` | Síntese harmônica, janelas, validação de chegada |
| Calado | `src/lib/mare.ts` | Resolução de calado efetivo (catálogo ou previsão externa) |

---

## 3. Modelo de domínio

### 3.1 Portos

Cada porto possui:

- Identificador, coordenadas (lat/lon);
- `calado_max_metros` — limite operacional catalogado;
- `profundidade_canal_m` — profundidade nominal do canal (usada na maré);
- `dias_operacao` — tempo médio de operação portuária;
- `despesas_portuarias_usd` — custo fixo por escala;
- `amplitude_media_m`, `restricao_noturna`, `offset_mare_m` — parâmetros hidrográficos.

### 3.2 Navios

Dois tipos contratuais:

| Tipo | Modelo de custo fixo |
|------|----------------------|
| **TC** (Time Charter) | Custo diário × duração da viagem |
| **SPOT** | Frete fixo por viagem + demurrage |

Atributos físicos relevantes:

- `calado_carregado_metros` / `calado_vazio_metros`;
- Capacidade em **CBM** ou **TEU**;
- `capacidade_peso_t` (deadweight útil);
- `slots_reefer` (tomadas refrigeradas);
- `perfil_consumo` — consumo de bunker (MT/dia) por modo operacional;
- `velocidade_referencia` — perfil **FULL**, **ECO** ou **MIN** (multiplicadores de consumo).

### 3.3 Demandas

Representam entregas a atender:

- Porto destino, data de necessidade, prioridade (ALTA/MEDIA/BAIXA);
- Volume (CBM ou TEU), produtos detalhados, peso, classe IMO;
- `janela_min_dias` / `janela_max_dias` — intervalo entre entregas no mesmo porto (ressuprimento).

### 3.4 Premissas globais

- Período de planejamento (`inicio_periodo`, `fim_periodo`);
- Porto de origem (base da frota);
- Limites de ocupação (%), portos por viagem, intervalo mínimo entre viagens;
- Preço de bunker (USD/MT), taxa de câmbio;
- Flags de maré: `usar_previsao_mare`, margens UKC e meteorológica.

---

## 4. Motor de marés

### 4.1 Fontes de dados

O Pharos suporta duas fontes, em ordem de preferência:

1. **WorldTides API** (opcional, com `worldtides_api_key`) — alturas a cada 30 min, datum CD;
2. **Síntese harmônica local** (padrão, offline) — coeficientes extraídos da **Tábua DHN 2026** para 10 portos brasileiros catalogados.

Portos sem harmônicas completas recebem **síntese aproximada**, escalando as componentes do porto de referência (TEMADRE) pela amplitude média cadastrada. A fonte é marcada como `aproximada` na saída.

### 4.2 Modelo matemático — síntese harmônica

A altura da maré η(t) em um instante t é modelada como superposição de componentes astronômicas:

\[
\eta(t) = \eta_0 + \sum_{i \in \mathcal{C}} A_i \cos(\omega_i \cdot t_h - \phi_i)
\]

Onde:

- \(t_h\) = horas desde o epoch **J2000** (01/01/2000 12:00 UTC);
- \(\mathcal{C}\) = conjunto de componentes: **M2, S2, N2, K1, O1, M4, MS4, K2**;
- \(A_i\) = amplitude (m), \(\phi_i\) = fase (graus → radianos);
- \(\omega_i\) = frequência angular (rad/h), constantes tabuladas em `FREQ_RAD_H`;
- \(\eta_0 = 1{,}0\) m — nível médio de referência aplicado na implementação.

**Frequências angulares (rad/h):**

| Componente | ω (rad/h) | Significado |
|------------|-----------|-------------|
| M2 | 0,50591 | Principal lunar semi-diurna |
| S2 | 0,52360 | Principal solar semi-diurna |
| N2 | 0,49637 | Lunar elliptic |
| K1 | 0,26252 | Luni-solar diurna |
| O1 | 0,24339 | Lunar diurna |
| M4 | 1,01182 | Shallow water (M2²) |
| MS4 | 1,02951 | Shallow water (M2×S2) |
| K2 | 0,52504 | Modulação de S2 |

A série é gerada com passo default de **30 minutos** (`intervaloMin = 30`).

**Precisão declarada:** ±10–20 cm para portos com harmônicas DHN completas. Para planejamento com 1–2 meses de antecedência, recomenda-se margem meteorológica ≥ 0,5 m (surge/storm surge não modelado dinamicamente).

### 4.3 Janelas de navegação

Para cada porto e calado de referência do navio, percorre-se a série de maré e identificam-se **intervalos contínuos** em que:

1. Calado disponível ≥ calado do navio;
2. Não há bloqueio por **restrição noturna** (portos com `restricao_noturna = true` e calado > 13 m entre 18h–06h UTC).

Cada janela registra: início, fim, duração (h), altura mín/máx da maré, calado máximo disponível.

---

## 5. Calado, UKC e cruzamento com maré

### 5.1 Calado disponível (profundidade efetiva)

A profundidade operacional disponível para manobra combina profundidade nominal, maré e margens de segurança:

\[
D_{\text{disp}}(t) = D_{\text{nom}} + \eta(t) + \delta_{\text{local}} - M_{\text{seg}} - M_{\text{met}}
\]

| Símbolo | Significado | Default |
|---------|-------------|---------|
| \(D_{\text{nom}}\) | Profundidade do canal (`profundidade_m`) | Por porto |
| \(\eta(t)\) | Altura da maré no instante | Harmônica/API |
| \(\delta_{\text{local}}\) | Offset local (`offset_mare_m`) | 0 |
| \(M_{\text{seg}}\) | Margem de segurança (UKC operacional) | 0,50 m |
| \(M_{\text{met}}\) | Margem meteorológica (surge) | 0,30–0,50 m |

Implementação: `calcularCaladoDisponivel()` em `tideEngine.ts`.

### 5.2 Critério de viabilidade (UKC)

Um navio com calado carregado \(T_{\text{navio}}\) pode operar no porto no instante t se:

\[
T_{\text{navio}} \leq D_{\text{disp}}(t)
\]

A **margem UKC** resultante é:

\[
\text{UKC}(t) = D_{\text{disp}}(t) - T_{\text{navio}}
\]

Validação na chegada: `validarChegadaPorto()` seleciona o ponto da série harmônica **mais próximo** do horário previsto de chegada e aplica o critério acima.

### 5.3 Modos de resolução de calado no otimizador

O módulo `resolverCaladoPlanejamento()` opera em dois modos:

#### Modo A — Maré ativa (`usar_previsao_mare = true`)

1. Gera série harmônica de 3 dias a partir da data/hora de referência;
2. Calcula janelas viáveis para o calado do navio;
3. Valida chegada no instante previsto;
4. Retorna `calado_efetivo_m = min(calado_max_catalogo, calado_disponivel_na_chegada)`.

Fonte registrada: `mare` (harmônicas DHN) ou `aproximada`.

#### Modo B — Catálogo / previsão externa (`usar_previsao_mare = false`)

Usa `resolverCaladoMaximoPorto()`:

- Sem previsões externas: `calado_efetivo = calado_max_catalogo - margem_total`;
- Com array `previsoes_mare[]`: toma o **mínimo** calado admissível nas janelas que contêm a data de referência, limitado ao catálogo.

### 5.4 Integração no fluxo de otimização

O cruzamento calado × maré ocorre em **dois momentos**:

| Etapa | Função | Data usada |
|-------|--------|------------|
| **Seleção de demanda** | `navioElegivelParaPorto()` | `data_necessidade` + T12:00 |
| **Montagem da viagem** | `resolverCaladoPlanejamento()` | `data_chegada` calculada (transit time) |

Após construir todas as paradas, verifica-se:

```text
SE ∃ parada : calado_navio > calado_limite_efetivo_m
   ENTÃO descarta viagem e tenta no dia seguinte
```

**Nota:** existe implementação de `ajustarHorarioChegada()` para deslocar chegada à próxima janela de maré, porém **não está acoplada ao loop principal** na v3.3 — viagens inviáveis por calado são rejeitadas e reagendadas (+1 dia).

---

## 6. Modelagem de carga

### 6.1 Unidades

| Unidade | Uso |
|---------|-----|
| **CBM** | Granel líquido/sólido (default legado) |
| **TEU** | Contêineres (feeder) |

Navio e demanda devem ter **unidade compatível** (`unidadeCompativel`).

### 6.2 Restrições de capacidade por viagem

Para cada candidata a viagem, acumulam-se:

\[
\sum V \leq C_{\max} \cdot \frac{ocMax}{100}
\]

\[
\sum P \leq C_{\text{peso}}
\]

\[
\sum TEU_{\text{reefer}} \leq S_{\text{reefer}}
\]

Onde:

- \(V\) = volume (CBM ou TEU);
- \(C_{\max}\) = capacidade do navio;
- \(ocMax\) = teto de ocupação do cenário (%);
- \(P\) = peso em toneladas;
- \(S_{\text{reefer}}\) = slots reefer.

### 6.3 Fracionamento de demandas

Demandas podem ser **parcialmente atendidas** (`fracionarDemanda`): volumes, TEU, peso e lotes de produto são escalados proporcionalmente:

\[
q' = q \cdot \frac{V_{\text{alocado}}}{V_{\text{total}}}
\]

### 6.4 Segregação de produtos

- **Produtos incompatíveis** (ex.: Diesel S10 × GLP) não compartilham viagem;
- **Classes IMO/IMDG** seguem matriz simplificada de incompatibilidade (`IMO_INCOMPATIVEL`).

---

## 7. Modelos de custo

O custo total de uma viagem \(C_{\text{total}}\) é:

\[
C_{\text{total}} = C_{\text{navio}} + C_{\text{bunker}} + C_{\text{porto}} + C_{\text{dem}} + C_{\text{reefer}}
\]

### 7.1 Bunker (combustível)

\[
C_{\text{bunker}} = \sum_{f} d_f \cdot c_f \cdot \mu_v(f) \cdot p_{\text{bunker}}
\]

Onde:

- \(d_f\) = duração do trecho f (dias);
- \(c_f\) = consumo MT/dia do modo (carregado, vazio, descarga, trânsito);
- \(p_{\text{bunker}}\) = preço USD/MT (`bunker_preco_usd_mt`);
- \(\mu_v\) = multiplicador do perfil de velocidade do navio.

**Multiplicadores por perfil (`velocidade_referencia`):**

| Perfil | Carregado | Vazio | Descarga | Trânsito |
|--------|-----------|-------|----------|----------|
| FULL | 1,15 | 1,05 | 1,10 | 0,85 |
| ECO | 1,00 | 1,00 | 1,00 | 1,00 |
| MIN | 0,88 | 0,92 | 0,95 | 1,20 |

**Trechos modelados por viagem:**

1. Trânsito carregado (base → porto₁ → porto₂ → …);
2. Operação portuária (consumo `consumo_descarga_mt_dia` × `dias_operacao`);
3. Retorno vazio ao porto base.

**Limitação v3.3:** a velocidade é **fixa por navio** (`velocidade_referencia`); o motor **não otimiza** velocidade trecho a trecho — apenas aplica multiplicadores no cálculo de custo.

### 7.2 Hire — Time Charter (TC)

\[
C_{\text{TC}} = r_{\text{TC}} \cdot D_{\text{viagem}}
\]

- \(r_{\text{TC}}\) = `custo_tc_diario_usd`;
- \(D_{\text{viagem}}\) = dias entre partida e retorno ao base (arredondado, mínimo 1).

O hire TC cobre **toda a duração da viagem**, incluindo trânsito, operação portuária e retorno.

### 7.3 SPOT

\[
C_{\text{SPOT}} = F_{\text{fixo}}
\]

- \(F_{\text{fixo}}\) = `custo_spot_fixo_usd` (frete charter party por viagem).

### 7.4 Demurrage (SPOT)

Aplicável apenas a navios **SPOT** com laytime contratual:

\[
C_{\text{dem}} = \max(0,\; D_{\text{op}} - L) \cdot r_{\text{dem}}
\]

| Símbolo | Significado |
|---------|-------------|
| \(D_{\text{op}}\) | Dias de operação portuária na escala |
| \(L\) | Laytime contratual (`laytime_dias`) |
| \(r_{\text{dem}}\) | Taxa USD/dia (`demurrage_usd_dia`) |

**Limitação v3.3:** demurrage modela **excesso de laytime na operação**, não tempo de espera em fundeado por maré (não modelado explicitamente no custo de bunker/hire).

### 7.5 Despesas portuárias

\[
C_{\text{porto}} = \sum_{p \in \text{paradas}} \text{despesas\_portuarias\_usd}(p)
\]

Valor fixo por escala, independente de volume.

### 7.6 Reefer (contêiner refrigerado)

\[
C_{\text{reefer}} = TEU_r \cdot D \cdot c_{\text{energia}} + TEU_r \cdot D \cdot b_r \cdot p_{\text{bunker}}
\]

- \(TEU_r\) = total de TEU reefer na viagem;
- \(D\) = duração da viagem (dias);
- \(c_{\text{energia}}\) = `custo_energia_reefer_usd_dia_teu`;
- \(b_r\) = `consumo_reefer_mt_dia_por_teu` (bunker extra para geração a bordo).

### 7.7 Conversão cambial

\[
C_{\text{BRL}} = C_{\text{USD}} \cdot \text{taxa\_cambio\_usd\_brl}
\]

---

## 8. Restrições operacionais

### 8.1 Janelas de ressuprimento

Entre duas entregas no **mesmo porto**:

\[
\Delta t = t_{\text{planejada}} - t_{\text{última entrega}} \in [j_{\min}, j_{\max}]
\]

Defaults: \(j_{\min} = 0\), \(j_{\max} = 365\) dias se não informado.

### 8.2 Ocupação mínima

Exceto no cenário **OTIMISTA**, viagens com ocupação abaixo do limiar do cenário são **descartadas**:

\[
\frac{V_{\text{acumulado}}}{C_{\text{navio}}} \cdot 100 < ocMin \Rightarrow \text{rejeitar viagem}
\]

### 8.3 Limite de portos por viagem

Controlado por `max_portos_por_viagem` (premissa) e parâmetro do cenário (`maxPortosCenario`). Valor 0 = sem limite (usa 999 internamente).

### 8.4 Intervalo entre viagens

Após cada viagem, o navio fica indisponível por `intervalo_minimo_dias` a partir da data de retorno.

### 8.5 Matriz de distâncias

Distâncias e tempos de trânsito entre pares de portos são **entrada fixa** (`matriz_distancias`). Se rota não existir, fallback: **500 NM / 2 dias**.

Sequenciamento intra-viagem: **vizinho mais próximo** (greedy nearest-neighbor) a partir do porto base.

---

## 9. Heurística de otimização multi-porto

### 9.1 Classificação

Metaheurística **construtiva greedy** com:

- Ordenação prévia de demandas;
- Alocação iterativa a navios disponíveis;
- Validação de restrições hard (calado, carga, produtos);
- Sem backtracking global ou otimização por branch-and-bound.

Identificador de saída: `multi_porto_heuristica_v3.3`.

### 9.2 Ordenação de demandas

1. Agrupa por `porto_destino_id`;
2. Dentro do grupo: ordena por `data_necessidade`, depois prioridade (ALTA < MEDIA < BAIXA);
3. Reordena globalmente por **proximidade de faixa temporal** (blocos de ~7 dias) em relação ao início do período.

### 9.3 Loop principal (pseudo-código)

```
demandasRestantes ← demandas ordenadas
disponibilidade[navio] ← inicio_periodo

ENQUANTO demandasRestantes ≠ ∅ E iter < 200:
  navio ← navio disponível mais cedo (prioridade TC ou SPOT conforme cenário)
  portosViagem ← []
  volume ← 0

  PARA CADA demanda EM demandasRestantes:
    SE unidade incompatível OU calado ineligible OU janela ressuprimento OU produtos incompatíveis: CONTINUE
    SE portosViagem cheio OU capacidade excedida: BREAK/CONTINUE
    alocar demanda (total ou fracionada)

  portosViagem ← nearest_neighbor(portosViagem, porto_base)
  SE ocupação < ocMin (exceto OTIMISTA): adiar navio +1 dia; CONTINUE

  SIMULAR cronograma (transit + operação + retorno)
  CALCULAR custos
  SE calado incompatível em alguma parada: adiar navio +1 dia; CONTINUE

  REGISTRAR viagem
  MARCAR demandas atendidas
  disponibilidade[navio] ← retorno + intervalo_minimo
```

### 9.4 Seleção de navio

Fila ordenada por tipo (TC primeiro ou SPOT primeiro, conforme cenário). Escolhe o navio com **menor data de disponibilidade** que ainda esteja dentro do período.

### 9.5 Complexidade

- Iterações: até 200;
- Por iteração: O(D × P) demandas × validações;
- Cenários: 4 × execução independente;
- Execução típica: < 2 minutos no browser (Web Worker).

---

## 10. Cenários de planejamento

Quatro cenários são executados **em paralelo conceitual** (sequencial no worker) com parâmetros distintos:

| Cenário | ocMin (%) | ocMax (%) | Max portos | Prioridade navio | Objetivo |
|---------|-----------|-----------|------------|------------------|----------|
| **OTIMISTA** | 50 | 100 | ∞ | TC | Maximizar demanda atendida |
| **BASE** | premissa | premissa | premissa | TC | Equilíbrio custo × cobertura |
| **CONSERVADOR** | 70 | 95 | 3 | SPOT | Viagens curtas, menor risco |
| **CUSTO_MINIMO** | 80 | 100 | ∞ | TC | Minimizar custo total |

**Cenário recomendado** (score composto):

\[
\text{score} = \frac{\%\text{demanda atendida}}{C_{\text{total USD}} / 10^6 + 1}
\]

---

## 11. Cronograma e simulação temporal

### 11.1 Horário de partida

Default: **08:00** no dia de disponibilidade do navio.

### 11.2 Trânsito

\[
t_{\text{chegada}} = t_{\text{atual}} + \text{dias\_transito} \times 24\ \text{h}
\]

(arredondado para múltiplos de 0,5 h)

### 11.3 Operação portuária

\[
t_{\text{saída}} = t_{\text{chegada}} + \text{dias\_operacao} \times 24\ \text{h}
\]

### 11.4 Retorno ao base

Após última parada, calcula-se trânsito vazio de retorno ao `porto_origem_id`.

### 11.5 Duração da viagem

\[
D_{\text{viagem}} = \max\left(1,\ \text{round}\left(\frac{t_{\text{retorno}} - t_{\text{partida}}}{86400000}\right)\right)\ \text{dias}
\]

---

## 12. Métricas e saída

### 12.1 Métricas por cenário

| Métrica | Fórmula / descrição |
|---------|---------------------|
| `demanda_atendida_pct` | Média das taxas CBM e TEU atendidas |
| `custo_total_usd` | Σ custos de todas as viagens |
| `custo_medio_por_cbm_usd` | Custo total / volume entregue (unidade principal) |
| `ocupacao_media_pct` | Média de ocupação das viagens |
| `total_viagens` | Contagem de viagens geradas |
| `teu_reefer_total` | Soma de TEU reefer transportados |

### 12.2 Saída JSON (API)

Estrutura exportada (`gerarJsonSaida`):

```json
{
  "type": 4,
  "metaheuristica": "multi_porto_heuristica_v3.3",
  "cenario_recomendado": "BASE",
  "cenarios": [
    {
      "tipo": "OTIMISTA",
      "metricas": { "...": "..." },
      "viagens": [
        {
          "id": "V001",
          "navio": { "id", "nome", "tipo" },
          "periodo": { "inicio", "fim", "duracao_dias" },
          "carga": { "volume_cbm", "ocupacao_pct", "..." },
          "rota": { "distancia_total_nm", "paradas": [...] },
          "custos": { "custo_bunker_usd", "custo_tc_diario_usd", "..." }
        }
      ]
    }
  ]
}
```

Cada **parada** inclui `calado_limite_efetivo_m`, `fonte_calado`, `data_chegada`, `data_saida`, volumes entregues e produtos.

---

## 13. Limitações conhecidas e evoluções

| Aspecto | Estado v3.3 | Evolução sugerida |
|---------|-------------|-------------------|
| Ajuste de horário por maré | Função existe, não acoplada ao optimizer | Integrar `ajustarHorarioChegada` no loop de paradas |
| Espera em fundeado | Não modelada em bunker/hire | Custo de espera × consumo ancorado |
| Otimização de velocidade | Perfil fixo por navio | Escolher FULL/ECO/MIN por trecho |
| Demurrage | Só laytime operacional SPOT | Incluir waiting time por maré |
| Surge meteorológico | Margem fixa | Dados meteo ou ensemble |
| Validação calado na seleção | Usa `data_necessidade`, não chegada real | Unificar datetime de chegada |
| Solver | Heurística greedy | Metaheurísticas (GA, ALNS) ou MILP para subproblemas |

---

## 14. Referências de implementação

| Conceito | Arquivo | Função principal |
|----------|---------|------------------|
| Síntese harmônica | `src/lib/tideEngine.ts` | `preverMareHarmonico` |
| Calado disponível | `src/lib/tideEngine.ts` | `calcularCaladoDisponivel` |
| Janelas de maré | `src/lib/tideEngine.ts` | `calcularJanelasNavegacao` |
| Validação UKC | `src/lib/tideEngine.ts` | `validarChegadaPorto` |
| Calado no optimizer | `src/lib/optimizer/constraints.ts` | `resolverCaladoPlanejamento` |
| Bunker | `src/lib/optimizer/costs.ts` | `calcularCustoBunker` |
| Hire TC / SPOT | `src/lib/optimizer/costs.ts` | `calcularCustoNavio` |
| Demurrage | `src/lib/optimizer/costs.ts` | `calcularDemurrageSpot` |
| Motor principal | `src/lib/optimizer.ts` | `executarOtimizacao` |
| Espelho Python | `src/lib/tide_engine.py` | `validar_chegada_porto`, `ajustar_horario_chegada` |

---

## Apêndice A — Exemplo numérico simplificado

**Dados:**

- Porto: ITAQUI, \(D_{\text{nom}} = 19{,}0\) m  
- Maré na chegada: \(\eta = +1{,}2\) m  
- Margens: \(M_{\text{seg}} = 0{,}5\) m, \(M_{\text{met}} = 0{,}5\) m  
- Navio: \(T_{\text{navio}} = 12{,}5\) m  

**Cálculo:**

\[
D_{\text{disp}} = 19{,}0 + 1{,}2 - 0{,}5 - 0{,}5 = 19{,}2\ \text{m}
\]

\[
\text{UKC} = 19{,}2 - 12{,}5 = +6{,}7\ \text{m} \quad \Rightarrow \text{APROVADO}
\]

**Bunker (trecho carregado, 1,5 dias, ECO):**

\[
C_b = 1{,}5 \times 35 \times 1{,}0 \times 580 = \text{USD}\ 30{,}450
\]

**TC (viagem 12 dias, USD 22.000/dia):**

\[
C_{\text{TC}} = 12 \times 22{,}000 = \text{USD}\ 264{,}000
\]

---

## Apêndice B — Diagrama calado × maré × chegada

```
                    PLANEJAMENTO (antes da viagem)
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Série harmônica η(t) 30 min   │
              └───────────────┬───────────────┘
                              │
              ┌───────────────▼───────────────┐
              │ D_disp(t) = D_nom + η - margens│
              └───────────────┬───────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
  Elegibilidade         Janelas viáveis      Validação na
  (data necessidade)    (intervalos OK)      chegada simulada
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                    T_navio ≤ D_disp ?
                     /              \
                   SIM              NÃO
                    │                │
              Aceita viagem    Descarta / +1 dia
```

---

*Documento gerado com base no código-fonte Pharos v3.3. Para regenerar hash de integridade do software, executar `node scripts/generate-inpi-hash.mjs`.*
