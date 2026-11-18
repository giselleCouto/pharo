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
        "nome": "Terminal de Madre de Deus (TEMADRE)",
        "lat": -12.75, "lon": -38.62,
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
# Os dez portos do catálogo: 53 componentes ajustadas à Tábua de Marés DHN 2025 de
# cada porto. Espelho de src/lib/mareHarmonicas.ts (mesmos dados, mesmo gerador).
# ─────────────────────────────────────────────────────────────────────────────
# >>> HARMONICAS GERADAS — não editar à mão (mesmos dados de src/lib/mareHarmonicas.ts)
# Fonte: DHN, Tábuas de Marés 2025; convenção: eta = nível médio + Σ A·cos(ω·tJ − φ), tJ desde J2000 (UTC).
FREQ_RAD_H = {
    "M2": 0.505868049, "S2": 0.523598776, "N2": 0.496366918, "K2": 0.525032342,
    "K1": 0.262516170, "O1": 0.243351879, "P1": 0.261082606, "Q1": 0.233850748,
    "2N2": 0.486865787, "MU2": 0.488137322, "NU2": 0.497638453, "L2": 0.515369180,
    "M4": 1.011736098, "MS4": 1.029466825, "MN4": 1.002234967, "M3": 0.758802074,
    "MK3": 0.768384221, "M6": 1.517604149, "2MS6": 1.535334874, "SA": 0.000716782,
    "SSA": 0.001433566, "MM": 0.009501131, "MSF": 0.017730727, "MF": 0.019164293,
    "2Q1": 0.224349617, "SIGMA1": 0.225621152, "RHO1": 0.235122283, "M1": 0.253015039,
    "J1": 0.272017301, "OO1": 0.281680463, "MNS2": 0.478636192, "LAMBDA2": 0.514097645,
    "T2": 0.522882026, "R2": 0.524315525, "MSN2": 0.533099906, "ETA2": 0.534533473,
    "2SM2": 0.541329502, "MO3": 0.749219928, "SO3": 0.766950655, "SK3": 0.786114946,
    "SN4": 1.019965694, "MK4": 1.030900391, "S4": 1.047197551, "SK4": 1.048631118,
    "2MK5": 1.274252268, "2SK5": 1.310430505, "2MN6": 1.508103018, "MSN6": 1.525833743,
    "2MK6": 1.536768440, "2SM6": 1.553065600, "MSK6": 1.554499167, "3MK7": 1.780119769,
    "M8": 2.023472193,
}

NIVEL_MEDIO_M = {
    "ITAQUI": 3.34,
    "SANTOS": 0.78,
    "SUAPE": 1.28,
    "TEMADRE": 1.52,
    "PECÉM": 1.55,
    "MUCURIPE": 1.54,
    "VILA_DO_CONDE": 1.69,
    "PARANAGUÁ": 0.97,
    "ITAJAÍ": 0.61,
    "RIO_GRANDE": 0.22,
}

HARMONICAS: Dict[str, Dict] = {
    "ITAQUI": {
        "M2": (2.1448, 164.74), "S2": (0.6021, 329.54), "N2": (0.4396, 287.75), "L2": (0.2536, 182.04),
        "K2": (0.2061, 128.38), "O1": (0.1189, 321.75), "K1": (0.1073, 90.56), "MU2": (0.0907, 125.99),
        "NU2": (0.0835, 252.00), "2N2": (0.0568, 53.84), "MSN2": (0.0479, 346.81), "T2": (0.0318, 326.17),
        "P1": (0.0318, 111.04), "MSF": (0.0304, 340.46), "M1": (0.0191, 249.70), "LAMBDA2": (0.0182, 259.80),
        "ETA2": (0.0165, 123.65), "SN4": (0.0138, 296.71), "M3": (0.0108, 194.60), "MF": (0.0077, 36.90),
        "MM": (0.0076, 84.83), "MK4": (0.0064, 266.44), "MNS2": (0.0061, 356.44), "M8": (0.0054, 114.89),
        "M4": (0.0054, 146.66), "S4": (0.0042, 321.87), "MN4": (0.0041, 198.61), "M6": (0.0040, 320.46),
        "SSA": (0.0040, 14.98), "2MN6": (0.0029, 55.90), "SK4": (0.0029, 12.02), "R2": (0.0026, 104.06),
        "SO3": (0.0024, 264.91), "MSK6": (0.0023, 11.88), "MS4": (0.0023, 51.10), "SA": (0.0021, 201.88),
        "MK3": (0.0021, 250.68), "MSN6": (0.0014, 347.78), "2SM2": (0.0013, 135.79), "MO3": (0.0013, 196.53),
        "2MK6": (0.0013, 223.45), "J1": (0.0012, 111.33), "2MK5": (0.0011, 262.01), "SIGMA1": (0.0008, 328.63),
        "RHO1": (0.0008, 128.09), "2MS6": (0.0008, 271.90), "SK3": (0.0007, 121.00), "2SK5": (0.0006, 24.34),
        "3MK7": (0.0005, 28.31), "Q1": (0.0005, 50.31), "OO1": (0.0003, 176.20), "2Q1": (0.0002, 235.30),
        "2SM6": (0.0002, 3.13),
    },
    "SANTOS": {
        "M2": (0.3600, 49.49), "S2": (0.2334, 177.91), "O1": (0.1303, 193.98), "K2": (0.0827, 335.47),
        "K1": (0.0631, 349.27), "M3": (0.0566, 170.83), "N2": (0.0466, 244.91), "Q1": (0.0385, 287.16),
        "MO3": (0.0269, 112.29), "MK3": (0.0269, 261.92), "SK3": (0.0222, 215.87), "P1": (0.0192, 0.70),
        "RHO1": (0.0181, 3.17), "M4": (0.0143, 265.73), "M1": (0.0140, 45.77), "T2": (0.0134, 178.03),
        "NU2": (0.0088, 200.20), "2MS6": (0.0084, 95.21), "MU2": (0.0059, 166.81), "MM": (0.0053, 315.21),
        "2N2": (0.0049, 73.85), "J1": (0.0040, 261.83), "SIGMA1": (0.0038, 180.82), "SO3": (0.0035, 127.31),
        "MSF": (0.0035, 3.80), "M6": (0.0032, 356.67), "LAMBDA2": (0.0031, 70.72), "L2": (0.0030, 332.31),
        "2MK5": (0.0027, 89.87), "MS4": (0.0026, 236.21), "MF": (0.0025, 94.52), "2SM6": (0.0022, 204.95),
        "2SM2": (0.0022, 192.92), "ETA2": (0.0020, 116.81), "SSA": (0.0020, 178.69), "SN4": (0.0019, 67.68),
        "MSK6": (0.0018, 33.01), "SK4": (0.0018, 196.21), "MNS2": (0.0018, 5.79), "MN4": (0.0018, 165.39),
        "MSN2": (0.0017, 202.04), "2Q1": (0.0016, 224.53), "S4": (0.0015, 284.45), "MSN6": (0.0012, 282.81),
        "2MN6": (0.0011, 87.73), "R2": (0.0011, 344.10), "OO1": (0.0010, 303.48), "2MK6": (0.0009, 217.18),
        "M8": (0.0009, 28.94), "MK4": (0.0008, 327.35), "3MK7": (0.0008, 19.36), "SA": (0.0004, 76.47),
        "2SK5": (0.0001, 322.07),
    },
    "SUAPE": {
        "M2": (0.7340, 76.04), "S2": (0.2694, 218.69), "N2": (0.1484, 201.57), "K2": (0.1057, 11.50),
        "O1": (0.0632, 248.47), "NU2": (0.0552, 168.51), "K1": (0.0475, 84.50), "2N2": (0.0415, 327.64),
        "MF": (0.0344, 286.27), "MU2": (0.0319, 292.67), "L2": (0.0207, 131.68), "Q1": (0.0185, 356.90),
        "T2": (0.0160, 220.83), "P1": (0.0104, 97.57), "MNS2": (0.0079, 53.35), "LAMBDA2": (0.0049, 128.95),
        "ETA2": (0.0049, 246.73), "MSF": (0.0049, 212.72), "M3": (0.0048, 53.44), "M4": (0.0030, 96.28),
        "MN4": (0.0029, 171.65), "MS4": (0.0018, 55.91), "2SM2": (0.0018, 150.44), "R2": (0.0017, 0.44),
        "MM": (0.0014, 234.42), "M6": (0.0010, 18.19), "2MK6": (0.0009, 125.25), "MK4": (0.0009, 274.57),
        "M1": (0.0009, 67.24), "2MN6": (0.0008, 223.04), "SSA": (0.0006, 15.39), "MK3": (0.0006, 70.30),
        "MSN6": (0.0005, 130.93), "2MK5": (0.0005, 81.30), "S4": (0.0004, 276.46), "M8": (0.0004, 281.53),
        "SO3": (0.0004, 12.68), "RHO1": (0.0004, 137.54), "MSK6": (0.0004, 272.29), "SK4": (0.0004, 51.73),
        "J1": (0.0004, 24.66), "MO3": (0.0004, 215.39), "SN4": (0.0003, 295.97), "SK3": (0.0003, 201.32),
        "SA": (0.0003, 181.93), "2SM6": (0.0003, 150.08), "MSN2": (0.0003, 247.13), "2SK5": (0.0002, 23.82),
        "3MK7": (0.0002, 41.16), "OO1": (0.0001, 164.94), "2Q1": (0.0001, 284.27), "SIGMA1": (0.0001, 199.27),
        "2MS6": (0.0001, 116.25),
    },
    "TEMADRE": {
        "M2": (0.8679, 78.25), "S2": (0.3600, 222.40), "N2": (0.1561, 209.85), "K2": (0.1331, 12.22),
        "O1": (0.0774, 233.68), "SA": (0.0550, 105.54), "K1": (0.0455, 68.66), "MU2": (0.0404, 331.29),
        "NU2": (0.0278, 169.29), "Q1": (0.0242, 333.69), "SSA": (0.0230, 260.78), "2N2": (0.0222, 344.99),
        "L2": (0.0192, 137.51), "T2": (0.0192, 222.37), "M4": (0.0152, 211.71), "P1": (0.0148, 82.01),
        "M3": (0.0127, 72.12), "LAMBDA2": (0.0120, 101.73), "MSF": (0.0120, 329.87), "MS4": (0.0117, 86.55),
        "2SM2": (0.0112, 118.74), "ETA2": (0.0108, 260.18), "MNS2": (0.0086, 107.76), "SK3": (0.0070, 207.92),
        "M1": (0.0064, 229.61), "MSN2": (0.0061, 209.51), "R2": (0.0059, 29.49), "MM": (0.0057, 281.38),
        "2Q1": (0.0046, 55.78), "OO1": (0.0045, 142.20), "MK4": (0.0042, 229.83), "MN4": (0.0041, 268.65),
        "RHO1": (0.0038, 294.80), "SN4": (0.0032, 265.89), "SIGMA1": (0.0029, 23.48), "MF": (0.0027, 135.42),
        "M6": (0.0024, 51.15), "2MK6": (0.0020, 290.12), "MO3": (0.0019, 92.75), "SO3": (0.0018, 10.66),
        "2MN6": (0.0018, 198.39), "MSK6": (0.0017, 23.73), "S4": (0.0015, 84.48), "M8": (0.0012, 282.72),
        "J1": (0.0011, 34.44), "2MS6": (0.0011, 215.31), "SK4": (0.0009, 263.09), "3MK7": (0.0007, 78.60),
        "2SK5": (0.0004, 71.02), "2MK5": (0.0003, 202.74), "2SM6": (0.0003, 159.67), "MK3": (0.0002, 70.02),
        "MSN6": (0.0002, 159.40),
    },
    "PECÉM": {
        "M2": (0.9298, 95.55), "S2": (0.3044, 244.50), "N2": (0.1969, 213.02), "K2": (0.1073, 42.24),
        "O1": (0.0924, 290.62), "K1": (0.0817, 84.70), "MU2": (0.0567, 325.85), "NU2": (0.0356, 179.54),
        "2N2": (0.0250, 337.37), "Q1": (0.0243, 48.26), "P1": (0.0238, 103.40), "T2": (0.0174, 241.14),
        "M3": (0.0080, 105.99), "SK3": (0.0076, 105.44), "LAMBDA2": (0.0066, 190.90), "M4": (0.0036, 266.49),
        "MM": (0.0027, 236.93), "MNS2": (0.0024, 94.76), "L2": (0.0023, 347.25), "MS4": (0.0023, 125.26),
        "MSF": (0.0022, 348.55), "MN4": (0.0021, 2.62), "SIGMA1": (0.0020, 86.72), "MK3": (0.0018, 331.08),
        "R2": (0.0016, 30.63), "M1": (0.0016, 39.25), "MF": (0.0013, 220.19), "2SM2": (0.0011, 258.48),
        "SN4": (0.0010, 280.40), "2MK5": (0.0010, 104.51), "2MS6": (0.0010, 83.68), "M6": (0.0010, 104.78),
        "M8": (0.0010, 71.72), "RHO1": (0.0009, 137.52), "MK4": (0.0009, 276.35), "MSN2": (0.0008, 166.24),
        "S4": (0.0007, 323.41), "SK4": (0.0007, 80.00), "3MK7": (0.0006, 92.81), "J1": (0.0006, 54.18),
        "ETA2": (0.0005, 101.85), "SO3": (0.0005, 34.58), "SSA": (0.0004, 2.76), "2SM6": (0.0004, 166.86),
        "2MN6": (0.0003, 205.76), "2Q1": (0.0003, 276.04), "OO1": (0.0002, 136.44), "MSN6": (0.0002, 39.38),
        "MO3": (0.0001, 279.83), "2MK6": (0.0001, 163.26), "SA": (0.0001, 24.79), "2SK5": (0.0001, 240.29),
        "MSK6": (0.0000, 58.21),
    },
    "MUCURIPE": {
        "M2": (0.9202, 95.52), "S2": (0.3037, 244.13), "N2": (0.1990, 214.76), "K2": (0.1090, 37.34),
        "K1": (0.0838, 74.15), "O1": (0.0812, 290.91), "MU2": (0.0397, 307.43), "NU2": (0.0344, 179.14),
        "2N2": (0.0264, 338.57), "MF": (0.0262, 281.55), "L2": (0.0230, 165.01), "P1": (0.0204, 92.70),
        "T2": (0.0167, 243.92), "Q1": (0.0166, 43.89), "SSA": (0.0124, 173.90), "MNS2": (0.0107, 68.70),
        "M3": (0.0087, 101.21), "MM": (0.0086, 206.13), "SA": (0.0078, 274.62), "M4": (0.0066, 273.62),
        "M1": (0.0056, 159.13), "ETA2": (0.0052, 271.02), "MS4": (0.0046, 102.11), "LAMBDA2": (0.0045, 143.58),
        "MO3": (0.0034, 215.08), "J1": (0.0030, 319.79), "MN4": (0.0026, 0.92), "RHO1": (0.0025, 4.94),
        "MSF": (0.0022, 350.48), "SIGMA1": (0.0021, 108.83), "MK4": (0.0020, 247.68), "2Q1": (0.0016, 118.29),
        "R2": (0.0016, 28.37), "S4": (0.0013, 83.57), "2MK5": (0.0012, 102.15), "MSN2": (0.0009, 193.52),
        "M6": (0.0009, 100.22), "SN4": (0.0008, 282.08), "SK3": (0.0008, 135.69), "2MK6": (0.0008, 273.49),
        "2MN6": (0.0007, 239.27), "3MK7": (0.0006, 28.48), "2SM2": (0.0006, 256.80), "SO3": (0.0006, 78.79),
        "MK3": (0.0005, 61.29), "2SM6": (0.0005, 195.55), "M8": (0.0005, 37.27), "2MS6": (0.0005, 91.09),
        "MSK6": (0.0005, 292.27), "SK4": (0.0003, 219.44), "OO1": (0.0002, 25.70), "MSN6": (0.0002, 181.67),
        "2SK5": (0.0001, 254.00),
    },
    "VILA_DO_CONDE": {
        "M2": (1.0917, 317.61), "S2": (0.3094, 127.20), "N2": (0.2057, 80.69), "K1": (0.1247, 185.07),
        "O1": (0.1207, 54.23), "K2": (0.1098, 275.17), "L2": (0.0991, 4.61), "M4": (0.0767, 190.21),
        "SSA": (0.0728, 158.87), "NU2": (0.0701, 20.00), "MU2": (0.0627, 253.54), "MF": (0.0496, 304.71),
        "MS4": (0.0491, 349.68), "MSF": (0.0474, 173.74), "MM": (0.0456, 233.13), "2N2": (0.0395, 209.57),
        "MN4": (0.0362, 309.51), "MO3": (0.0337, 252.45), "MK3": (0.0282, 33.28), "M6": (0.0264, 57.48),
        "T2": (0.0253, 118.92), "LAMBDA2": (0.0244, 14.45), "MK4": (0.0186, 137.51), "2SM2": (0.0185, 81.83),
        "P1": (0.0183, 180.49), "MSN2": (0.0164, 148.02), "Q1": (0.0154, 153.89), "2MS6": (0.0152, 222.92),
        "M3": (0.0148, 85.55), "M1": (0.0141, 236.10), "2MN6": (0.0136, 172.77), "SK3": (0.0113, 178.80),
        "SIGMA1": (0.0107, 22.74), "SO3": (0.0104, 83.90), "SN4": (0.0100, 132.25), "2MK6": (0.0080, 15.35),
        "S4": (0.0077, 193.13), "SK4": (0.0076, 332.08), "MSN6": (0.0074, 350.97), "J1": (0.0066, 110.90),
        "M8": (0.0060, 110.61), "2MK5": (0.0053, 223.37), "MSK6": (0.0050, 215.63), "2SM6": (0.0048, 46.22),
        "MNS2": (0.0047, 337.88), "RHO1": (0.0047, 24.62), "3MK7": (0.0043, 26.06), "2Q1": (0.0031, 115.03),
        "R2": (0.0026, 273.98), "ETA2": (0.0021, 204.51), "OO1": (0.0010, 17.31), "2SK5": (0.0004, 195.40),
        "SA": (0.0002, 0.42),
    },
    "PARANAGUÁ": {
        "M2": (0.4823, 60.38), "S2": (0.3340, 194.08), "M4": (0.1322, 198.71), "M3": (0.1311, 200.43),
        "K2": (0.1309, 344.02), "O1": (0.1240, 189.92), "K1": (0.0882, 357.14), "MO3": (0.0833, 103.06),
        "SO3": (0.0677, 21.62), "N2": (0.0618, 264.01), "MK3": (0.0560, 331.39), "MN4": (0.0535, 287.27),
        "MS4": (0.0529, 65.27), "L2": (0.0446, 119.13), "MU2": (0.0434, 331.26), "SK3": (0.0432, 275.73),
        "MM": (0.0305, 232.78), "Q1": (0.0269, 317.92), "2N2": (0.0262, 38.30), "P1": (0.0261, 7.51),
        "M1": (0.0242, 348.34), "MSF": (0.0240, 18.77), "RHO1": (0.0224, 292.69), "MF": (0.0209, 147.67),
        "MK4": (0.0201, 231.70), "SSA": (0.0163, 356.58), "2MS6": (0.0146, 151.15), "SN4": (0.0145, 210.82),
        "2SM2": (0.0144, 129.42), "SK4": (0.0141, 338.14), "T2": (0.0115, 219.04), "M6": (0.0111, 14.85),
        "ETA2": (0.0102, 204.89), "2Q1": (0.0091, 91.52), "LAMBDA2": (0.0091, 115.26), "MNS2": (0.0073, 331.24),
        "S4": (0.0069, 169.21), "R2": (0.0068, 71.18), "NU2": (0.0061, 177.18), "2MK5": (0.0056, 323.54),
        "2MK6": (0.0056, 264.44), "J1": (0.0052, 158.56), "M8": (0.0047, 158.50), "SA": (0.0045, 201.79),
        "MSK6": (0.0038, 51.18), "OO1": (0.0030, 51.28), "2SM6": (0.0026, 268.79), "SIGMA1": (0.0023, 264.36),
        "MSN6": (0.0018, 241.56), "2MN6": (0.0017, 104.81), "3MK7": (0.0013, 91.86), "2SK5": (0.0011, 165.48),
        "MSN2": (0.0006, 60.32),
    },
    "ITAJAÍ": {
        "M2": (0.2433, 29.27), "S2": (0.1768, 158.27), "O1": (0.1234, 186.50), "K2": (0.0722, 305.07),
        "K1": (0.0612, 352.82), "SA": (0.0471, 57.23), "M4": (0.0453, 34.36), "N2": (0.0442, 239.47),
        "Q1": (0.0355, 295.11), "M3": (0.0324, 124.78), "MO3": (0.0262, 79.04), "MS4": (0.0255, 265.93),
        "MN4": (0.0236, 114.82), "MK3": (0.0212, 238.63), "SO3": (0.0192, 272.92), "P1": (0.0169, 350.96),
        "MSF": (0.0149, 339.20), "MU2": (0.0124, 292.09), "L2": (0.0122, 335.77), "MF": (0.0114, 322.87),
        "NU2": (0.0107, 206.67), "2MS6": (0.0095, 22.34), "MK4": (0.0094, 62.30), "SK3": (0.0091, 156.34),
        "2N2": (0.0078, 343.46), "ETA2": (0.0074, 203.50), "2SM6": (0.0069, 182.02), "OO1": (0.0060, 151.33),
        "M1": (0.0059, 125.92), "RHO1": (0.0056, 192.69), "2Q1": (0.0055, 41.98), "SN4": (0.0049, 326.07),
        "SIGMA1": (0.0047, 84.88), "MSN2": (0.0046, 149.92), "MSK6": (0.0045, 313.35), "M6": (0.0043, 242.22),
        "T2": (0.0042, 186.04), "2MK5": (0.0036, 77.46), "SK4": (0.0031, 268.36), "SSA": (0.0026, 173.59),
        "J1": (0.0025, 293.04), "2SM2": (0.0025, 348.78), "MNS2": (0.0022, 88.33), "S4": (0.0022, 145.07),
        "MM": (0.0022, 349.70), "2MK6": (0.0021, 183.38), "LAMBDA2": (0.0016, 65.08), "M8": (0.0012, 348.38),
        "2MN6": (0.0011, 128.78), "MSN6": (0.0010, 290.04), "3MK7": (0.0006, 337.66), "R2": (0.0004, 284.12),
        "2SK5": (0.0003, 56.09),
    },
    "RIO_GRANDE": {
        "O1": (0.1285, 180.78), "K1": (0.0534, 346.43), "M4": (0.0471, 38.58), "N2": (0.0449, 288.78),
        "S2": (0.0430, 134.07), "Q1": (0.0400, 270.28), "MN4": (0.0315, 127.84), "M2": (0.0252, 178.62),
        "K2": (0.0205, 282.14), "MS4": (0.0178, 241.97), "P1": (0.0142, 8.71), "M3": (0.0131, 102.42),
        "NU2": (0.0102, 262.47), "2N2": (0.0098, 22.58), "MK3": (0.0077, 141.96), "SO3": (0.0074, 193.67),
        "RHO1": (0.0073, 285.41), "SK3": (0.0072, 325.36), "2MS6": (0.0070, 296.79), "MK4": (0.0068, 22.75),
        "MO3": (0.0066, 355.84), "ETA2": (0.0055, 164.08), "MU2": (0.0054, 309.21), "S4": (0.0049, 318.39),
        "M6": (0.0048, 97.42), "L2": (0.0041, 93.76), "SIGMA1": (0.0037, 245.27), "2MK5": (0.0036, 123.83),
        "J1": (0.0034, 314.04), "2MN6": (0.0034, 176.70), "MSN2": (0.0031, 150.17), "2SM2": (0.0028, 61.57),
        "2MK6": (0.0027, 85.50), "LAMBDA2": (0.0025, 316.13), "MF": (0.0020, 149.11), "MSK6": (0.0017, 248.33),
        "2SM6": (0.0016, 120.74), "M1": (0.0016, 85.30), "SSA": (0.0015, 16.50), "MM": (0.0015, 218.26),
        "MSN6": (0.0014, 32.62), "SN4": (0.0011, 268.57), "R2": (0.0009, 284.49), "2Q1": (0.0008, 175.03),
        "3MK7": (0.0008, 317.57), "MSF": (0.0007, 167.87), "M8": (0.0007, 359.74), "SA": (0.0006, 162.80),
        "OO1": (0.0006, 161.79), "SK4": (0.0005, 103.29), "T2": (0.0004, 249.39), "2SK5": (0.0001, 59.41),
        "MNS2": (0.0001, 51.76),
    },
}
# <<< HARMONICAS GERADAS

# Nível médio usado por portos fora do catálogo.
NIVEL_MEDIO_PADRAO_M = 1.0


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

    nivel_medio = NIVEL_MEDIO_M.get(porto_id, NIVEL_MEDIO_PADRAO_M)
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
        resultados.append(PontoMare(dt=dt_ponto, altura_m=round(eta + nivel_medio, 3)))
        # nível médio: referência acima do zero hidrográfico (mesmo datum da profundidade)

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
