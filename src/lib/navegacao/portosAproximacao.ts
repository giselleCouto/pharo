// ═══════════════════════════════════════════════════════════════
// PONTOS DE APROXIMAÇÃO DOS PORTOS DO CATÁLOGO
// ═══════════════════════════════════════════════════════════════
// A rota de planejamento vai de ponto de aproximação a ponto de aproximação: é onde termina o
// trecho de praticagem (canal dragado, bacia de evolução, berço) e começa a travessia costeira.
// O trecho interno é conduzido pelo prático e pelas cartas oficiais de maior escala e NÃO faz
// parte desta rota.
//
// Os pontos abaixo são REFERÊNCIAS DE PLANEJAMENTO escolhidas sobre a grade GEBCO/Natural Earth:
// fora da barra ou da baía, em água com profundidade ≥ 20 m na amostra mais rasa da célula e
// afastados da costa. NÃO são os pontos oficiais de embarque do prático — confira-os nas Normas e
// Procedimentos da Capitania dos Portos (NPCP) da jurisdição e na ENC antes de usar no ECDIS.

import { LatLon } from './geo';

export interface PortoNavegacao {
  id: string;
  nome: string;
  /** Posição de referência do porto (a mesma do catálogo de marés). */
  porto: LatLon;
  /** Ponto de aproximação — início/fim da rota de planejamento. */
  aproximacao: LatLon;
  descricaoAproximacao: string;
}

export const PORTOS_NAVEGACAO: Record<string, PortoNavegacao> = {
  VILA_DO_CONDE: {
    id: 'VILA_DO_CONDE', nome: 'Vila do Conde (PA)',
    porto: { lat: -1.53, lon: -48.78 },
    aproximacao: { lat: -0.2, lon: -47.7 },
    descricaoAproximacao: 'Saída da Baía de Marajó, a NE da barra do Pará',
  },
  ITAQUI: {
    id: 'ITAQUI', nome: 'Itaqui (MA)',
    porto: { lat: -2.57, lon: -44.36 },
    aproximacao: { lat: -2.0, lon: -44.1 },
    descricaoAproximacao: 'Setor externo do canal da Baía de São Marcos',
  },
  'PECÉM': {
    id: 'PECÉM', nome: 'Pecém (CE)',
    porto: { lat: -3.54, lon: -38.8 },
    aproximacao: { lat: -3.43, lon: -38.74 },
    descricaoAproximacao: 'Ao largo do terminal, ao norte do quebra-mar',
  },
  MUCURIPE: {
    id: 'MUCURIPE', nome: 'Mucuripe — Fortaleza (CE)',
    porto: { lat: -3.72, lon: -38.48 },
    aproximacao: { lat: -3.625, lon: -38.44 },
    descricaoAproximacao: 'Ao norte da Ponta do Mucuripe',
  },
  SUAPE: {
    id: 'SUAPE', nome: 'Suape (PE)',
    porto: { lat: -8.4, lon: -34.98 },
    aproximacao: { lat: -8.4, lon: -34.89 },
    descricaoAproximacao: 'A leste da linha de recifes, na entrada do canal de acesso',
  },
  TEMADRE: {
    id: 'TEMADRE', nome: 'Madre de Deus — TEMADRE (BA)',
    porto: { lat: -12.75, lon: -38.62 },
    aproximacao: { lat: -13.06, lon: -38.56 },
    descricaoAproximacao: 'Entrada da Baía de Todos os Santos, ao sul do Farol da Barra',
  },
  SANTOS: {
    id: 'SANTOS', nome: 'Santos (SP)',
    porto: { lat: -23.96, lon: -46.32 },
    aproximacao: { lat: -24.09, lon: -46.27 },
    descricaoAproximacao: 'Ao sul da Baía de Santos, a oeste da Ilha da Moela',
  },
  'PARANAGUÁ': {
    id: 'PARANAGUÁ', nome: 'Paranaguá (PR)',
    porto: { lat: -25.5, lon: -48.52 },
    aproximacao: { lat: -25.62, lon: -48.08 },
    descricaoAproximacao: 'Ao largo do Canal da Galheta, na isóbata de 20 m',
  },
  'ITAJAÍ': {
    id: 'ITAJAÍ', nome: 'Itajaí (SC)',
    porto: { lat: -26.91, lon: -48.65 },
    aproximacao: { lat: -26.91, lon: -48.55 },
    descricaoAproximacao: 'A leste dos molhes da barra do Itajaí-Açu',
  },
  NAVEGANTES: {
    id: 'NAVEGANTES', nome: 'Portonave — Navegantes (SC)',
    porto: { lat: -26.88, lon: -48.65 },
    aproximacao: { lat: -26.87, lon: -48.55 },
    descricaoAproximacao: 'A leste dos molhes da barra do Itajaí-Açu (mesma barra de Itajaí)',
  },
  RIO_GRANDE: {
    id: 'RIO_GRANDE', nome: 'Rio Grande (RS)',
    porto: { lat: -32.04, lon: -52.1 },
    aproximacao: { lat: -32.25, lon: -51.9 },
    descricaoAproximacao: 'Ao largo dos molhes da Barra do Rio Grande',
  },
};

export const AVISO_PONTO_APROXIMACAO =
  'Pontos de aproximação são referências de planejamento, não os pontos oficiais de embarque do prático: ' +
  'confira nas NPCP da Capitania e na ENC. O trecho de praticagem (do ponto de aproximação ao berço) não faz parte da rota.';
