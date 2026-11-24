# Plano de Viagem — fase 1: rota por waypoints e exportação RTZ

> **Rota para planejamento.** A autoridade de navegação é o ECDIS com ENC oficial. Antes de usar, a rota
> deve passar pelo *route check* do ECDIS contra as ENC atualizadas, os Avisos aos Navegantes e o Roteiro.
> O Pharos não é um ECDIS e não tem certificação IEC nem IHO.

## O que faz

- Gera a rota de cada perna entre dois portos do catálogo. A rota vai de ponto de aproximação a ponto de
  aproximação, em loxodromias.
- Mantém afastamentos mínimos configuráveis:
  - da linha de costa (NM);
  - da isóbata de segurança (m, arredondada para a próxima isóbata disponível, como no ECDIS);
  - da própria isóbata (NM).
- Calcula a velocidade planejada por perna e o ETA de cada waypoint. Os horários do Pharos são hora de
  Brasília (UTC−3); o RTZ grava em UTC.
- Exporta em RTZ, o formato de intercâmbio de rotas da IEC 61174:
  - **RTZ 1.0** (padrão): o esquema do Anexo S da IEC 61174 Ed. 4.0 (2015);
  - **RTZ 1.2** (opcional): a revisão da IEC PAS 61174-1:2021.

  Os dois formatos são validados contra os XSD oficiais publicados pelo CIRM.
- No app:
  - a página **Plano de Viagem** monta uma perna avulsa;
  - a aba **Plano de Viagem** em *Resultados* lista as pernas de cada viagem otimizada. Cada perna pode ser
    planejada e exportada em RTZ, uma a uma ou em lote.

## Fontes de dados e licenças

| Dado | Fonte | Licença |
| --- | --- | --- |
| Batimetria | GEBCO_2021 Grid, 15″ — GEBCO Compilation Group (2021), doi:10.5285/c6612cbe-50b3-0cff-e053-6c86abc09f8f. O recorte vem do ERDDAP do IFREMER. | Domínio público, com atribuição. Os termos da GEBCO dizem que a grade **não** deve ser usada para navegação. |
| Linha de costa | Natural Earth 1:10m, camadas `land` e `minor_islands` | Domínio público |

Os arquivos gerados ficam no repositório:

- `public/navegacao/grade_costa_br.bin`: grade de 1′, 86 KB;
- `public/navegacao/costa_br.json`: costa simplificada, só para o mapa;
- `scripts/fixtures/ne10m_terra_costa_br.json`: costa em resolução original, usada nos testes.

Para regenerar: `python scripts/navegacao/gerar_grade_navegacao.py --cache <pasta temporária>`. O script
baixa cerca de 100 MB, uma faixa de 1° por vez.

## Método

1. **Grade de 1′ (~1 NM)**, do Chuí ao Oiapoque, com Fernando de Noronha e o Atol das Rocas.
   - Uma célula é **terra** se algum polígono Natural Earth toca nela ou se alguma amostra GEBCO de 15″
     dentro dela está acima do nível do mar.
   - A **profundidade** da célula é a da amostra mais rasa, guardada em degraus (2, 5, 10, 15, 20, 25, 30,
     40, 50, 100 e 200 m).
2. **Transformada de distância** (Felzenszwalb–Huttenlocher), em milhas náuticas, a partir da terra e das
   células mais rasas que a isóbata.
3. **Célula navegável:**
   - profundidade ≥ isóbata;
   - afastamento ≥ o configurado, mais uma margem de discretização de √2 NM.

   Com essa margem, o afastamento real de **qualquer ponto** da perna até a terra fica ≥ o configurado.
4. **Zona de aproximação.** Em volta de cada ponto de aproximação, o afastamento de terra cai para 0,2 NM;
   a isóbata é mantida. É por ali que o navio sai da área de praticagem.
   - O raio da zona cresce só quando é necessário, e a rota avisa.
   - Se a isóbata escolhida não tem saída para o mar a partir do ponto (por exemplo, um bolsão fundo
     dentro de uma baía), a rota começa no ponto mais próximo que tem saída, também com aviso.
5. **A\*** em 16 direções, sem cortar quinas.
6. **Suavização por linha de visada.** A verificação é exata, percorrendo todas as células que a
   loxodromia atravessa, sem amostragem. Sobram só os waypoints de mudança de rumo, mais um waypoint no
   limite de cada zona de aproximação. Esse waypoint fica sobre a própria perna e serve para dar XTD menor
   só ao trecho de aproximação.

### Pontos de aproximação

Cada porto do catálogo tem um ponto de aproximação: fora da barra ou da baía, em água com 20 m ou mais e
afastado da costa (`src/lib/navegacao/portosAproximacao.ts`).

- São **referências de planejamento**, não os pontos oficiais de embarque do prático. Confira-os nas NPCP
  da Capitania e na ENC.
- O trecho do ponto de aproximação até o berço é de praticagem e **não** faz parte da rota.
- Um porto cadastrado pelo usuário fora do catálogo usa a própria posição. O roteador desloca o início até
  a água navegável mais próxima e avisa.

### RTZ

Convenções seguidas, conforme o XSD e os arquivos de teste do CIRM:

- o `<leg>` de um waypoint descreve a perna que chega a ele;
- `routeName` é igual ao nome do arquivo;
- pernas `Loxodrome`;
- `safetyContour` igual à isóbata usada;
- calado em `draughtForward`/`draughtAft`.

O cronograma `manual` traz o ETD e a velocidade de cada perna; o `calculated` traz o ETA de cada waypoint.
O RTZ 1.0 usa o nome de elemento `sheduleElement`, como está grafado no XSD da Ed. 4. Para um ECDIS que só
lê `scheduleElement`, exporte em 1.2.

O aviso de planejamento aparece em três lugares: no comentário do cabeçalho, no `routeStatus` e numa
extensão.

Exemplos: [`exemplos/PHAROS_SANTOS-SUAPE_RTZ10.rtz`](exemplos/PHAROS_SANTOS-SUAPE_RTZ10.rtz) e
[`exemplos/PHAROS_SANTOS-SUAPE_RTZ12.rtz`](exemplos/PHAROS_SANTOS-SUAPE_RTZ12.rtz).

## Testes

```bash
npx esbuild scripts/testar-plano-viagem.ts --bundle --platform=node --format=esm --outfile=testar-plano-viagem.mjs
node testar-plano-viagem.mjs            # completo: os 55 pares do catálogo, ~20 s
node testar-plano-viagem.mjs --rapido   # 6 pares
```

O teste verifica as rotas sem passar pela grade do roteador:

- nenhuma perna cruza os polígonos Natural Earth em resolução original. A verificação é por interseção
  exata segmento × aresta, em Mercator;
- afastamentos medidos contra a costa vetorial e contra as células da grade;
- profundidade ≥ isóbata ao longo de todas as pernas.

Também confere a estrutura do RTZ e o ETA e valida o arquivo contra os XSD oficiais com
`scripts/navegacao/validar_rtz_xsd.py`. Essa parte requer Python com `lxml`. Os XSD não são versionados: o
script baixa do CIRM na primeira vez.

## Limitações conhecidas

- **Resolução.** A GEBCO de 15″ e a grade de 1′ não resolvem cabeços de coral nem perigos isolados
  menores que cerca de 1 NM.
  - Exemplo: com isóbata de 20 m, a rota Santos–Salvador passa pelo Canal dos Abrolhos, entre o Parcel das
    Paredes e o arquipélago. Com 25–30 m, passa por fora.
  - É o ECDIS, com a ENC, que detecta esses perigos.
- **Rotas, ventos e correntes.** Não há esquemas de separação de tráfego, áreas de exclusão de plataformas
  (Bacias de Campos e Santos), zonas de fundeio nem áreas restritas. As pernas usam velocidade constante,
  sem corrente nem tempo.
- **Pontos de aproximação.** São aproximados, e a praticagem não está modelada.

## Fase 2

- Avisos de mau tempo da METAREA V, do CHM/Marinha do Brasil, sobrepostos à rota.
- Previsão meteorológica e de ondas ao longo da rota, de modelos abertos, com ETA por waypoint.
- Sobreposições à rota:
  - ECA (área de controle de emissões);
  - pirataria e conflito;
  - áreas de exclusão de plataformas.
- Pontos de embarque do prático tirados das NPCP de cada Capitania.
