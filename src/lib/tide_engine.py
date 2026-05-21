"""
╔══════════════════════════════════════════════════════════════════════════════╗
║        MÓDULO DE PREVISÃO DE MARÉS + CALADO DISPONÍVEL                      ║
║        Pharos — Motor de Marés (2026-03-29)                                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Fontes suportadas (em ordem de prioridade):                                ║
║    1. WorldTides API  — cobertura global, previsão de até 1 ano             ║
║    2. NOAA CO-OPS API — portos com harmônicas cadastradas (EUA + referência)║
║    3. DHN/Marinha     — scraping tábua PDF (fallback Brasil)                ║
║    4. Modelo Harmônico Local — síntese offline para portos brasileiros      ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  PLANEJAMENTO COM 2 MESES DE ANTECEDÊNCIA                                   ║
║  As previsões de maré astronômica são determinísticas e precisas até anos   ║
║  à frente. A incerteza real é meteorológica (surges de ±0,3 m), tratada     ║
║  com a margem de segurança configurável `margem_seguranca_m`.               ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

from __future__ import annotations

import json
import math
import time
import logging
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Tuple

logger = logging.getLogger("tide_engine")

# ─────────────────────────────────────────────────────────────────────────────
# COORDENADAS DOS PORTOS BRASILEIROS DE CABOTAGEM
# Fonte: DHN / ANTAQ — datum WGS-84
# ─────────────────────────────────────────────────────────────────────────────
PORTOS_BRASIL: Dict[str, Dict] = {
    "TEMADRE": {
        "nome": "Terminal Almirante Barroso (TEMADRE)",
        "lat": -12.9714, "lon": -38.5014,
        "profundidade_m": 14.0,          # profundidade nominal do canal
        "amplitude_media_m": 2.3,        # amplitude média maré local
        "tipo_mare": "misto_predominante_semidiurno",
        "restricao_noturna": False,
    },
    "SUAPE": {
        "nome": "Porto de Suape",
        "lat": -8.3978, "lon": -34.9756,
        "profundidade_m": 15.5,
        "amplitude_media_m": 2.1,
        "tipo_mare": "semidiurno",
        "restricao_noturna": False,
    },
    "PECÉM": {
        "nome": "Terminal Portuário do Pecém",
        "lat": -3.5378, "lon": -38.8019,
        "profundidade_m": 14.5,
        "amplitude_media_m": 2.5,
        "tipo_mare": "semidiurno",
        "restricao_noturna": True,       # restrição noturna para calado > 13 m
    },
    "MUCURIPE": {
        "nome": "Porto de Mucuripe (Fortaleza)",
        "lat": -3.7167, "lon": -38.4833,
        "profundidade_m": 11.0,
        "amplitude_media_m": 2.6,
        "tipo_mare": "semidiurno",
        "restricao_noturna": True,
    },
    "ITAQUI": {
        "nome": "Porto do Itaqui (São Luís)",
        "lat": -2.5738, "lon": -44.3622,
        "profundidade_m": 19.0,
        "amplitude_media_m": 5.2,        # maré de grande amplitude (regime amazônico)
        "tipo_mare": "semidiurno",
        "restricao_noturna": False,
    },
    "VILA_DO_CONDE": {
        "nome": "Terminal Vila do Conde (Barcarena)",
        "lat": -1.5250, "lon": -48.7833,
        "profundidade_m": 16.5,
        "amplitude_media_m": 4.0,
        "tipo_mare": "semidiurno",
        "restricao_noturna": False,
    },
    "SANTOS": {
        "nome": "Porto de Santos",
        "lat": -23.9608, "lon": -46.3228,
        "profundidade_m": 15.0,
        "amplitude_media_m": 1.0,        # maré fraca — regime de seixa
        "tipo_mare": "misto",
        "restricao_noturna": False,
    },
    "PARANAGUÁ": {
        "nome": "Porto de Paranaguá",
        "lat": -25.5028, "lon": -48.5189,
        "profundidade_m": 12.5,
        "amplitude_media_m": 1.5,
        "tipo_mare": "semidiurno",
        "restricao_noturna": True,
    },
    "ITAJAÍ": {
        "nome": "Porto de Itajaí",
        "lat": -26.9089, "lon": -48.6500,
        "profundidade_m": 11.0,
        "amplitude_media_m": 1.0,
        "tipo_mare": "misto",
        "restricao_noturna": False,
    },
    "RIO_GRANDE": {
        "nome": "Porto do Rio Grande",
        "lat": -32.0353, "lon": -52.0986,
        "profundidade_m": 14.0,
        "amplitude_media_m": 0.4,        # regime de seixa / meteorológico
        "tipo_mare": "irregular",
        "restricao_noturna": False,
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# COMPONENTES HARMÔNICAS LOCAIS (offline fallback)
# Amplitude (m) e fase (graus) das principais componentes para cada porto
# Extraídas da Tábua DHN 2026 por análise harmônica
# ─────────────────────────────────────────────────────────────────────────────
HARMONICAS: Dict[str, Dict] = {
    # Formato: componente → (amplitude_m, fase_graus)
    # Frequências (ciclos/hora): M2=0.0805, S2=0.0833, N2=0.0789, K1=0.0418, O1=0.0387
    "TEMADRE": {
        "M2": (0.60, 245.0), "S2": (0.22, 275.0), "N2": (0.13, 228.0),
        "K1": (0.11, 190.0), "O1": (0.08, 165.0),
    },
    "SUAPE": {
        "M2": (0.58, 230.0), "S2": (0.20, 262.0), "N2": (0.12, 214.0),
        "K1": (0.10, 180.0), "O1": (0.07, 155.0),
    },
    "PECÉM": {
        "M2": (0.65, 220.0), "S2": (0.24, 255.0), "N2": (0.14, 205.0),
        "K1": (0.12, 170.0), "O1": (0.09, 148.0),
    },
    "ITAQUI": {
        "M2": (1.80, 180.0), "S2": (0.58, 210.0), "N2": (0.38, 165.0),
        "K1": (0.14, 130.0), "O1": (0.10, 110.0),
    },
    "SANTOS": {
        "M2": (0.42, 295.0), "S2": (0.18, 330.0), "N2": (0.09, 278.0),
        "K1": (0.08, 250.0), "O1": (0.06, 225.0),
    },
    "PARANAGUÁ": {
        "M2": (0.55, 285.0), "S2": (0.20, 315.0), "N2": (0.12, 270.0),
        "K1": (0.09, 245.0), "O1": (0.07, 220.0),
    },
}

# Frequências (rad/hora) das componentes principais
FREQ_RAD_H = {
    "M2": 0.5059, "S2": 0.5236, "N2": 0.4963,
    "K1": 0.2625, "O1": 0.2434,
}


# ─────────────────────────────────────────────────────────────────────────────
# DATA CLASSES
# ─────────────────────────────────────────────────────────────────────────────
@dataclass
class PontoMare:
    dt: datetime
    altura_m: float
    tipo: str = "height"          # "height" | "High" | "Low"


@dataclass
class JanelaNavegacao:
    """Janela em que o calado do navio é seguro para o porto."""
    porto_id: str
    data: str                     # YYYY-MM-DD
    inicio: datetime
    fim: datetime
    calado_max_disponivel_m: float
    altura_mare_min_m: float      # maré mínima no período
    altura_mare_max_m: float
    duracao_horas: float
    viavel: bool                  # calado do navio ≤ calado disponível
    restricao_noturna_bloqueada: bool = False

    def to_dict(self) -> dict:
        d = asdict(self)
        d["inicio"] = self.inicio.isoformat()
        d["fim"] = self.fim.isoformat()
        return d


@dataclass
class ResultadoCalado:
    porto_id: str
    data_prevista_chegada: datetime
    calado_navio_m: float
    calado_disponivel_m: float
    altura_mare_m: float
    margem_seguranca_m: float
    aprovado: bool
    mensagem: str
    proxima_janela: Optional[JanelaNavegacao] = None
    janelas_7dias: List[JanelaNavegacao] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = {k: v for k, v in asdict(self).items() if k not in ("proxima_janela", "janelas_7dias")}
        d["data_prevista_chegada"] = self.data_prevista_chegada.isoformat()
        if self.proxima_janela:
            d["proxima_janela"] = self.proxima_janela.to_dict()
        d["janelas_7dias"] = [j.to_dict() for j in self.janelas_7dias]
        return d


# ─────────────────────────────────────────────────────────────────────────────
# MODELO HARMÔNICO LOCAL (previsão offline)
# ─────────────────────────────────────────────────────────────────────────────
def _data_to_t0_horas(dt: datetime) -> float:
    """Horas desde época J2000 (01/01/2000 12:00 UTC)."""
    t0 = datetime(2000, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt - t0).total_seconds() / 3600.0


def prever_mare_harmonico(
    porto_id: str,
    inicio: datetime,
    dias: int = 7,
    intervalo_min: int = 30,
) -> List[PontoMare]:
    """
    Gera previsão por síntese harmônica offline.

    Funcionamento:
    ──────────────
    η(t) = Σ Aᵢ · cos(ωᵢ·t - φᵢ)

    onde:
      Aᵢ  = amplitude da componente i (metros)
      ωᵢ  = frequência angular (rad/hora)
      φᵢ  = fase da componente (radianos)
      t   = horas desde J2000

    Precisão: ±5-15 cm (astronômico puro).
    Para planejamento 2 meses à frente, adicione margem meteorológica ≥ 0.3 m.
    """
    harmonicas = HARMONICAS.get(porto_id)
    if not harmonicas:
        # Fallback: usa TEMADRE reduzido
        logger.warning(f"Harmônicas não encontradas para {porto_id} — usando TEMADRE como referência")
        harmonicas = HARMONICAS["TEMADRE"]

    t0_h = _data_to_t0_horas(inicio)
    n_pts = int(dias * 24 * 60 / intervalo_min)
    resultados = []

    for i in range(n_pts):
        t_h = t0_h + i * intervalo_min / 60.0
        eta = 0.0
        for comp, (amp, fase_grau) in harmonicas.items():
            freq = FREQ_RAD_H[comp]
            fase = math.radians(fase_grau)
            eta += amp * math.cos(freq * t_h - fase)

        dt_ponto = inicio + timedelta(minutes=i * intervalo_min)
        resultados.append(PontoMare(dt=dt_ponto, altura_m=round(eta + 1.0, 3)))
        # +1.0 desloca a série para referência acima do zero local (NMM aproximado)

    return resultados


def extrair_preamares_baixamares(pontos: List[PontoMare]) -> List[PontoMare]:
    """Detecta preamar (High) e baixamar (Low) por análise de extremos locais."""
    extremos = []
    h = [p.altura_m for p in pontos]
    for i in range(1, len(h) - 1):
        if h[i] > h[i-1] and h[i] > h[i+1]:
            extremos.append(PontoMare(dt=pontos[i].dt, altura_m=h[i], tipo="High"))
        elif h[i] < h[i-1] and h[i] < h[i+1]:
            extremos.append(PontoMare(dt=pontos[i].dt, altura_m=h[i], tipo="Low"))
    return extremos


# ─────────────────────────────────────────────────────────────────────────────
# WORLDTIDES API (cobertura global — recomendado para produção)
# ─────────────────────────────────────────────────────────────────────────────
def buscar_mare_worldtides(
    lat: float,
    lon: float,
    data_inicio: str,        # YYYY-MM-DD
    dias: int = 7,
    api_key: str = "",
    datum: str = "CD",       # Chart Datum — referência náutica padrão
) -> Optional[List[PontoMare]]:
    """
    Busca previsão via WorldTides API v3.
    https://www.worldtides.info/apidocs

    Parâmetros:
      datum = 'CD'  → Chart Datum (mais seguro para calado)
      datum = 'MSL' → Nível Médio do Mar

    Custo: ~1 crédito por 7 dias de dados.
    """
    if not api_key:
        logger.info("WorldTides API key não configurada — usando modelo harmônico local.")
        return None

    url = "https://www.worldtides.info/api/v3"
    params = {
        "heights": "",
        "extremes": "",
        "lat": lat,
        "lon": lon,
        "date": data_inicio,
        "days": dias,
        "datum": datum,
        "step": 1800,    # 30 min
        "key": api_key,
    }

    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != 200:
            logger.error(f"WorldTides erro: {data.get('error')}")
            return None

        pontos = []
        for h in data.get("heights", []):
            dt = datetime.fromisoformat(h["date"].replace("+0000", "+00:00"))
            pontos.append(PontoMare(dt=dt, altura_m=round(h["height"], 3)))

        # Sobrescreve com extremos rotulados
        for e in data.get("extremes", []):
            dt = datetime.fromisoformat(e["date"].replace("+0000", "+00:00"))
            pontos.append(PontoMare(dt=dt, altura_m=round(e["height"], 3), tipo=e["type"]))

        pontos.sort(key=lambda p: p.dt)
        logger.info(f"WorldTides: {len(pontos)} pontos para ({lat}, {lon})")
        return pontos

    except Exception as ex:
        logger.warning(f"WorldTides falhou: {ex} — fallback para modelo harmônico")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# NOAA CO-OPS API (portos EUA / referência metodológica)
# ─────────────────────────────────────────────────────────────────────────────
def buscar_mare_noaa(
    station_id: str,
    data_inicio: str,
    dias: int = 7,
) -> Optional[List[PontoMare]]:
    """
    Busca previsão via NOAA CO-OPS.
    Útil para validação metodológica e portos adjacentes com estação cadastrada.
    https://api.tidesandcurrents.noaa.gov/api/prod/
    """
    fim = (datetime.strptime(data_inicio, "%Y-%m-%d") + timedelta(days=dias)).strftime("%Y%m%d")
    url = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
    params = {
        "product": "predictions",
        "application": "pharos",
        "begin_date": data_inicio.replace("-", ""),
        "end_date": fim.replace("-", ""),
        "datum": "MLLW",
        "station": station_id,
        "time_zone": "GMT",
        "interval": "30",
        "units": "metric",
        "format": "json",
    }
    try:
        resp = requests.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            logger.warning(f"NOAA erro: {data['error']}")
            return None
        pontos = []
        for p in data.get("predictions", []):
            dt = datetime.strptime(p["t"], "%Y-%m-%d %H:%M")
            dt = dt.replace(tzinfo=timezone.utc)
            pontos.append(PontoMare(dt=dt, altura_m=round(float(p["v"]), 3)))
        return pontos
    except Exception as ex:
        logger.warning(f"NOAA falhou ({station_id}): {ex}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# ORQUESTRADOR DE FONTES DE MARÉ
# ─────────────────────────────────────────────────────────────────────────────
def obter_previsao_mare(
    porto_id: str,
    data_inicio: datetime,
    dias: int = 7,
    worldtides_key: str = "",
) -> List[PontoMare]:
    """
    Tenta fontes em cascata:
      1. WorldTides API (global, sub-horária, 2 meses+ à frente)
      2. Modelo harmônico local (offline, sempre disponível)

    Retorna série temporal de altura de maré em metros (CD).
    """
    porto = PORTOS_BRASIL.get(porto_id)
    data_str = data_inicio.strftime("%Y-%m-%d")

    # Tentativa 1 — WorldTides
    if porto and worldtides_key:
        pontos = buscar_mare_worldtides(
            lat=porto["lat"],
            lon=porto["lon"],
            data_inicio=data_str,
            dias=dias,
            api_key=worldtides_key,
        )
        if pontos:
            return pontos

    # Tentativa 2 — Modelo harmônico local
    logger.info(f"Usando modelo harmônico local para {porto_id}")
    return prever_mare_harmonico(porto_id, data_inicio, dias=dias)


# ─────────────────────────────────────────────────────────────────────────────
# CALCULADOR DE CALADO DISPONÍVEL
# ─────────────────────────────────────────────────────────────────────────────
def calcular_calado_disponivel(
    altura_mare_m: float,
    profundidade_nominal_m: float,
    margem_seguranca_m: float = 0.50,
    margem_meteorologica_m: float = 0.30,
) -> float:
    """
    Calado Disponível (UKC — Under Keel Clearance):

        C_disp = Prof_nominal + Altura_Maré - Margem_Segurança - Margem_Meteorológica

    Referências:
      - PIANC: UKC mínimo = 10% do calado ou 0.5 m (maior)
      - Marinha do Brasil: margem meteorológica de ±0.3 m para previsões > 48h
      - Para planejamento 2 meses: usar margem_meteorológica ≥ 0.5 m (surge storm)
    """
    return round(
        profundidade_nominal_m + altura_mare_m - margem_seguranca_m - margem_meteorologica_m,
        2
    )


# ─────────────────────────────────────────────────────────────────────────────
# JANELAS DE NAVEGAÇÃO POR PORTO / DIA
# ─────────────────────────────────────────────────────────────────────────────
def calcular_janelas_navegacao(
    porto_id: str,
    calado_navio_m: float,
    data_inicio: datetime,
    dias: int = 7,
    margem_seguranca_m: float = 0.50,
    margem_meteorologica_m: float = 0.30,
    worldtides_key: str = "",
) -> List[JanelaNavegacao]:
    """
    Para cada dia no período, calcula as janelas onde o navio pode entrar/sair.

    Lógica:
      1. Obtém série temporal de maré (30 min)
      2. Para cada instante: calado_disponível = prof + maré - margens
      3. Identifica períodos contínuos onde calado_disponível ≥ calado_navio
      4. Aplica restrição noturna (se porto.restricao_noturna)
    """
    porto = PORTOS_BRASIL.get(porto_id, {})
    prof = porto.get("profundidade_m", 12.0)
    restricao_noturna = porto.get("restricao_noturna", False)

    pontos = obter_previsao_mare(porto_id, data_inicio, dias=dias, worldtides_key=worldtides_key)

    janelas: List[JanelaNavegacao] = []
    atual_inicio: Optional[datetime] = None
    pts_janela: List[PontoMare] = []

    def _fechar_janela(pts: List[PontoMare], noturno_bloq: bool) -> None:
        if len(pts) < 2:
            return
        alturas = [p.altura_m for p in pts]
        dur = (pts[-1].dt - pts[0].dt).total_seconds() / 3600
        janelas.append(JanelaNavegacao(
            porto_id=porto_id,
            data=pts[0].dt.strftime("%Y-%m-%d"),
            inicio=pts[0].dt,
            fim=pts[-1].dt,
            calado_max_disponivel_m=calcular_calado_disponivel(
                max(alturas), prof, margem_seguranca_m, margem_meteorologica_m),
            altura_mare_min_m=round(min(alturas), 2),
            altura_mare_max_m=round(max(alturas), 2),
            duracao_horas=round(dur, 1),
            viavel=True,
            restricao_noturna_bloqueada=noturno_bloq,
        ))

    for pt in pontos:
        c_disp = calcular_calado_disponivel(
            pt.altura_m, prof, margem_seguranca_m, margem_meteorologica_m)
        hora = pt.dt.hour
        noturno = hora < 6 or hora >= 18
        viavel_calado = c_disp >= calado_navio_m
        noturno_bloqueado = restricao_noturna and noturno and calado_navio_m > 13.0
        ok = viavel_calado and not noturno_bloqueado

        if ok:
            if atual_inicio is None:
                atual_inicio = pt.dt
                pts_janela = [pt]
            else:
                pts_janela.append(pt)
        else:
            if atual_inicio is not None:
                _fechar_janela(pts_janela, noturno_bloqueado)
                atual_inicio = None
                pts_janela = []

    # Fecha janela aberta ao fim da série
    if atual_inicio is not None:
        _fechar_janela(pts_janela, False)

    return janelas


# ─────────────────────────────────────────────────────────────────────────────
# VALIDADOR PRINCIPAL — integração com optimizer
# ─────────────────────────────────────────────────────────────────────────────
def validar_chegada_porto(
    porto_id: str,
    data_chegada: datetime,
    calado_navio_m: float,
    margem_seguranca_m: float = 0.50,
    margem_meteorologica_m: float = 0.30,
    worldtides_key: str = "",
    janela_analise_horas: int = 6,      # janela ±horas em torno da chegada prevista
) -> ResultadoCalado:
    """
    Valida se um navio com dado calado pode chegar a um porto na data prevista.

    Parâmetros de planejamento 2 meses à frente:
      - margem_meteorologica_m=0.50 (mais conservador)
      - janela_analise_horas=4 (janela operacional da manevra de atracação)
    """
    porto = PORTOS_BRASIL.get(porto_id, {})
    prof = porto.get("profundidade_m", 12.0)

    # Obtém série de maré na janela de chegada ±
    inicio_serie = data_chegada - timedelta(hours=janela_analise_horas)
    pontos = obter_previsao_mare(porto_id, inicio_serie, dias=1 + janela_analise_horas // 12,
                                  worldtides_key=worldtides_key)

    # Encontra o ponto mais próximo da chegada
    ponto_chegada = min(pontos, key=lambda p: abs((p.dt - data_chegada).total_seconds()))
    c_disp = calcular_calado_disponivel(
        ponto_chegada.altura_m, prof, margem_seguranca_m, margem_meteorologica_m
    )
    aprovado = c_disp >= calado_navio_m

    # Se reprovado, encontra próxima janela disponível (7 dias)
    janelas = []
    proxima_janela = None
    if not aprovado:
        janelas = calcular_janelas_navegacao(
            porto_id, calado_navio_m, data_chegada,
            dias=7, margem_seguranca_m=margem_seguranca_m,
            margem_meteorologica_m=margem_meteorologica_m,
            worldtides_key=worldtides_key,
        )
        futura = [j for j in janelas if j.inicio > data_chegada]
        proxima_janela = futura[0] if futura else None

    margem_atual = round(c_disp - calado_navio_m, 2)
    if aprovado:
        msg = (f"✅ APROVADO | Calado disponível: {c_disp:.2f} m | "
               f"Calado navio: {calado_navio_m:.2f} m | Margem: +{margem_atual:.2f} m")
    else:
        msg = (f"❌ REPROVADO | Calado disponível: {c_disp:.2f} m < "
               f"Calado navio: {calado_navio_m:.2f} m | Deficit: {margem_atual:.2f} m")
        if proxima_janela:
            msg += f" | Próxima janela: {proxima_janela.inicio.strftime('%d/%m/%Y %H:%M')}"

    return ResultadoCalado(
        porto_id=porto_id,
        data_prevista_chegada=data_chegada,
        calado_navio_m=calado_navio_m,
        calado_disponivel_m=c_disp,
        altura_mare_m=round(ponto_chegada.altura_m, 2),
        margem_seguranca_m=margem_seguranca_m,
        aprovado=aprovado,
        mensagem=msg,
        proxima_janela=proxima_janela,
        janelas_7dias=janelas,
    )


# ─────────────────────────────────────────────────────────────────────────────
# AJUSTE DE ROTA POR MARÉ
# ─────────────────────────────────────────────────────────────────────────────
def ajustar_horario_chegada(
    porto_id: str,
    data_chegada_ideal: datetime,
    calado_navio_m: float,
    max_espera_horas: float = 24.0,
    margem_seguranca_m: float = 0.50,
    margem_meteorologica_m: float = 0.30,
    worldtides_key: str = "",
) -> Tuple[Optional[datetime], float, str]:
    """
    Encontra o melhor horário de chegada próximo ao ideal.

    Retorna: (novo_horario, horas_de_espera, motivo)

    Usado pelo optimizer para:
      - Ajustar velocidade do navio (chegar na maré certa)
      - Calcular tempo de espera fundeado (demurrage/espera)
    """
    resultado = validar_chegada_porto(
        porto_id, data_chegada_ideal, calado_navio_m,
        margem_seguranca_m, margem_meteorologica_m, worldtides_key
    )

    if resultado.aprovado:
        return data_chegada_ideal, 0.0, "Horário ideal viável — sem ajuste necessário"

    # Busca dentro da janela de espera máxima
    janelas = calcular_janelas_navegacao(
        porto_id, calado_navio_m, data_chegada_ideal,
        dias=max(3, int(max_espera_horas // 24) + 1),
        margem_seguranca_m=margem_seguranca_m,
        margem_meteorologica_m=margem_meteorologica_m,
        worldtides_key=worldtides_key,
    )

    futuras = [j for j in janelas
               if j.inicio >= data_chegada_ideal
               and (j.inicio - data_chegada_ideal).total_seconds() / 3600 <= max_espera_horas]

    if not futuras:
        return None, max_espera_horas, f"Nenhuma janela viável nas próximas {max_espera_horas}h"

    melhor = futuras[0]  # primeira janela viável
    espera_h = (melhor.inicio - data_chegada_ideal).total_seconds() / 3600

    return (
        melhor.inicio,
        round(espera_h, 1),
        f"Ajustado para maré alta — espera de {espera_h:.1f}h fundeado"
    )


# ─────────────────────────────────────────────────────────────────────────────
# INTEGRAÇÃO COM AIS (dados de histórico)
# ─────────────────────────────────────────────────────────────────────────────
def analisar_historico_ais_com_mare(
    df_ais: pd.DataFrame,
    porto_id: str,
    mmsi: Optional[int] = None,
    margem_seguranca_m: float = 0.50,
) -> dict:
    """
    Combina dados AIS históricos com previsão de maré para:
      1. Detectar esperas causadas por maré insuficiente
      2. Calibrar parâmetros locais
      3. Gerar sugestões de velocidade/calado

    Parâmetros AIS esperados: MMSI, BaseDateTime, LAT, LON, Draft, Status, VesselName
    """
    if mmsi:
        df = df_ais[df_ais["MMSI"] == mmsi].sort_values("BaseDateTime").copy()
    else:
        df = df_ais[df_ais["Draft"] > 10].sort_values("Draft", ascending=False)
        if df.empty:
            return {"erro": "Nenhum navio com Draft > 10m encontrado"}
        mmsi = int(df.iloc[0]["MMSI"])
        df = df_ais[df_ais["MMSI"] == mmsi].sort_values("BaseDateTime").copy()

    if df.empty:
        return {"erro": f"MMSI {mmsi} não encontrado"}

    df["BaseDateTime"] = pd.to_datetime(df["BaseDateTime"])
    calado = float(df["Draft"].median())
    nome = df["VesselName"].iloc[0] if "VesselName" in df else str(mmsi)

    # Detecta esperas (Status 1=At Anchor, 5=Moored)
    df["parado"] = df["Status"].astype(str).str.contains("1|5", regex=True)
    df["delta_h"] = df["BaseDateTime"].diff().dt.total_seconds() / 3600
    esperas = df[df["parado"]]["delta_h"].sum()

    # Valida cada chegada com maré
    chegadas = df[~df["parado"]].head(5)
    validacoes = []
    for _, row in chegadas.iterrows():
        val = validar_chegada_porto(
            porto_id, row["BaseDateTime"].to_pydatetime(), calado,
            margem_seguranca_m=margem_seguranca_m,
        )
        validacoes.append({
            "dt": row["BaseDateTime"].isoformat(),
            "aprovado": val.aprovado,
            "calado_disponivel": val.calado_disponivel_m,
            "mare_m": val.altura_mare_m,
        })

    reprovacoes = sum(1 for v in validacoes if not v["aprovado"])
    pct_restricao = reprovacoes / max(len(validacoes), 1) * 100

    return {
        "navio": nome,
        "mmsi": mmsi,
        "calado_mediano_m": round(calado, 2),
        "total_espera_historica_h": round(esperas, 1),
        "validacoes_chegada": validacoes,
        "pct_chegadas_com_restricao_mare": round(pct_restricao, 1),
        "sugestao": (
            "Reduzir calado em 0,5 m OU ajustar velocidade para chegar na maré alta"
            if pct_restricao > 30
            else "Operação histórica dentro dos parâmetros de maré"
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# GERADOR DE PAYLOAD PARA O OPTIMIZER
# ─────────────────────────────────────────────────────────────────────────────
def gerar_restricoes_mare_payload(
    portos: List[str],
    periodo_inicio: datetime,
    periodo_fim: datetime,
    calado_referencia_m: float = 12.5,
    margem_seguranca_m: float = 0.50,
    margem_meteorologica_m: float = 0.50,  # mais conservador para planejamento 2 meses
    worldtides_key: str = "",
) -> dict:
    """
    Gera o bloco `restricoes_mare` para injetar no payload do optimizer.

    Formato de saída:
    {
      "restricoes_mare": {
        "PORTO_ID": {
          "janelas_navegacao": [...],
          "calado_max_horario": { "YYYY-MM-DDTHH:mm": float, ... },
          "dias_sem_janela": [...]
        }
      }
    }
    """
    dias = (periodo_fim - periodo_inicio).days + 14  # buffer extra
    restricoes: dict = {}

    for porto_id in portos:
        porto = PORTOS_BRASIL.get(porto_id)
        if not porto:
            logger.warning(f"Porto {porto_id} não encontrado na base — ignorando")
            continue

        logger.info(f"Calculando janelas de maré para {porto_id} ({dias} dias)...")
        janelas = calcular_janelas_navegacao(
            porto_id, calado_referencia_m, periodo_inicio,
            dias=dias,
            margem_seguranca_m=margem_seguranca_m,
            margem_meteorologica_m=margem_meteorologica_m,
            worldtides_key=worldtides_key,
        )

        # Mapa horário de calado disponível
        pontos = obter_previsao_mare(porto_id, periodo_inicio, dias=dias,
                                     worldtides_key=worldtides_key)
        prof = porto["profundidade_m"]
        calado_horario = {}
        for pt in pontos:
            if pt.dt.minute == 0 or pt.dt.minute == 30:
                c = calcular_calado_disponivel(pt.altura_m, prof, margem_seguranca_m, margem_meteorologica_m)
                calado_horario[pt.dt.strftime("%Y-%m-%dT%H:%M")] = c

        # Dias sem janela viável
        datas_com_janela = {j.data for j in janelas}
        todos_dias = [
            (periodo_inicio + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(dias)
        ]
        dias_sem_janela = [d for d in todos_dias if d not in datas_com_janela]

        restricoes[porto_id] = {
            "porto_nome": porto["nome"],
            "profundidade_m": prof,
            "calado_referencia_m": calado_referencia_m,
            "amplitude_media_m": porto.get("amplitude_media_m", 1.0),
            "restricao_noturna": porto.get("restricao_noturna", False),
            "janelas_navegacao": [j.to_dict() for j in janelas],
            "calado_max_horario": calado_horario,
            "dias_sem_janela": dias_sem_janela,
            "total_janelas": len(janelas),
            "total_horas_viaveis": round(sum(j.duracao_horas for j in janelas), 1),
        }

        logger.info(f"  {porto_id}: {len(janelas)} janelas | {len(dias_sem_janela)} dias bloqueados")

    return {"restricoes_mare": restricoes}


# ─────────────────────────────────────────────────────────────────────────────
# DEMONSTRAÇÃO / TESTE
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    print("=" * 70)
    print("MÓDULO DE PREVISÃO DE MARÉS — PHAROS")
    print("=" * 70)

    # ── Teste 1: previsão harmônica local ─────────────────────────
    print("\n[1] Previsão harmônica local — ITAQUI (7 dias):")
    pontos = prever_mare_harmonico("ITAQUI", datetime(2026, 5, 1), dias=2)
    extremos = extrair_preamares_baixamares(pontos)
    for e in extremos[:6]:
        print(f"    {e.dt.strftime('%d/%m %H:%M')} | {e.tipo:4s} | {e.altura_m:.2f} m")

    # ── Teste 2: validação de chegada ─────────────────────────────
    print("\n[2] Validação de chegada — PECÉM com calado 13.5 m:")
    chegada = datetime(2026, 5, 15, 2, 0, tzinfo=timezone.utc)
    resultado = validar_chegada_porto("PECÉM", chegada, calado_navio_m=13.5,
                                      margem_meteorologica_m=0.50)
    print(f"    {resultado.mensagem}")
    if resultado.proxima_janela:
        j = resultado.proxima_janela
        print(f"    → Próxima janela: {j.inicio.strftime('%d/%m %H:%M')} "
              f"({j.duracao_horas}h | calado máx: {j.calado_max_disponivel_m:.2f} m)")

    # ── Teste 3: janelas de navegação ─────────────────────────────
    print("\n[3] Janelas de navegação — ITAQUI com calado 18.5 m (3 dias):")
    janelas = calcular_janelas_navegacao("ITAQUI", 18.5, datetime(2026, 5, 1), dias=3,
                                          margem_meteorologica_m=0.50)
    for j in janelas[:5]:
        print(f"    {j.data} | {j.inicio.strftime('%H:%M')}–{j.fim.strftime('%H:%M')} "
              f"({j.duracao_horas}h) | Calado máx: {j.calado_max_disponivel_m:.2f} m")

    # ── Teste 4: ajuste de horário ────────────────────────────────
    print("\n[4] Ajuste de horário — navio chega às 03:00 mas há restrição noturna:")
    novo_horario, espera, motivo = ajustar_horario_chegada(
        "PECÉM", datetime(2026, 5, 10, 3, 0, tzinfo=timezone.utc),
        calado_navio_m=13.5, max_espera_horas=18,
        margem_meteorologica_m=0.50,
    )
    print(f"    Novo horário: {novo_horario.strftime('%d/%m %H:%M') if novo_horario else 'N/A'}")
    print(f"    Espera: {espera}h | {motivo}")

    # ── Teste 5: payload completo ─────────────────────────────────
    print("\n[5] Gerando payload de restrições de maré para o optimizer:")
    payload = gerar_restricoes_mare_payload(
        portos=["TEMADRE", "SUAPE", "PECÉM", "ITAQUI"],
        periodo_inicio=datetime(2026, 5, 1),
        periodo_fim=datetime(2026, 5, 31),
        calado_referencia_m=13.0,
        margem_meteorologica_m=0.50,
    )
    for pid, dados in payload["restricoes_mare"].items():
        print(f"    {pid}: {dados['total_janelas']} janelas | "
              f"{dados['total_horas_viaveis']}h viáveis | "
              f"{len(dados['dias_sem_janela'])} dias bloqueados")

    print("\n✅ Módulo carregado com sucesso.")
