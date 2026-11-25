"""
Gera os dados geográficos do módulo Plano de Viagem a partir de fontes ABERTAS.

Saídas (versionadas no repositório):
  public/navegacao/grade_costa_br.bin   grade de navegabilidade 1' (RLE) — usada pelo roteador
  public/navegacao/costa_br.json        linha de costa simplificada — só para desenhar o mapa
  scripts/fixtures/ne10m_terra_costa_br.json
                                        polígonos de terra na resolução original (Natural Earth 10m)
                                        — usados pelos testes para provar que nenhuma perna cruza terra

Fontes e licenças:
  * Batimetria: GEBCO_2021 Grid (15 arc-segundos), GEBCO Compilation Group (2021),
    doi:10.5285/c6612cbe-50b3-0cff-e053-6c86abc09f8f. Domínio público, uso livre com atribuição
    (https://www.gebco.net — termos de uso da grade). Acesso por recorte via ERDDAP do IFREMER
    (https://erddap.ifremer.fr/erddap/griddap/gebco2021). Os termos da GEBCO dizem que a grade NÃO
    deve ser usada para navegação nem para fins de segurança da navegação — por isso a rota do
    Pharos é só de planejamento e a autoridade é o ECDIS com ENC oficial.
  * Linha de costa: Natural Earth 1:10m, camadas "land" e "minor_islands" (v5.x),
    domínio público (https://www.naturalearthdata.com/about/terms-of-use/).

Método (por célula de 1 minuto de arco, ~1 milha náutica):
  * terra  = célula tocada por polígono Natural Earth (all_touched) OU qualquer amostra GEBCO de 15"
             com elevação > 0 dentro da célula (critério conservador: a ilha pequena que a Natural
             Earth omite entra pela GEBCO);
  * água   = classe de profundidade pela amostra MAIS RASA da célula (conservador), em degraus
             LIMIARES_M — como a isóbata de segurança de um ECDIS, que arredonda para a próxima
             isóbata disponível.

Uso (requer numpy, scipy, shapely, rasterio, pyshp; baixa ~100 MB em faixas de 1°, uma por vez):
  python scripts/navegacao/gerar_grade_navegacao.py --cache <pasta temporária>
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import shapefile  # pyshp
from rasterio import features
from rasterio.transform import from_origin
from scipy.io import netcdf_file
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

RAIZ = Path(__file__).resolve().parents[2]

# Recorte: costa brasileira do Chuí ao Oiapoque, com Fernando de Noronha e Atol das Rocas.
LAT_MIN, LAT_MAX = -35.0, 5.0
LON_MIN, LON_MAX = -54.5, -32.0
CELULA_DEG = 1.0 / 60.0  # 1 minuto de arco
SUB = 4  # amostras GEBCO (15") por célula em cada eixo

# Degraus de profundidade (m). Classe 0 = terra; classe c>=1 = 1 + nº de limiares <= profundidade.
LIMIARES_M = [2, 5, 10, 15, 20, 25, 30, 40, 50, 100, 200]

ERDDAP = "https://erddap.ifremer.fr/erddap/griddap/gebco2021.nc"
NE_URL = "https://naciscdn.org/naturalearth/10m/physical/{}.zip"


def baixar(url: str, destino: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "pharos-plano-de-viagem/1.0"})
    with urllib.request.urlopen(req, timeout=600) as r, open(destino, "wb") as f:
        while True:
            bloco = r.read(1 << 20)
            if not bloco:
                break
            f.write(bloco)


def faixa_gebco(lat0: float, cache: Path) -> tuple[np.ndarray, np.ndarray]:
    """Elevação máxima (m) e nº de amostras > 0 por célula de 1', para a faixa [lat0, lat0+1)."""
    npz = cache / f"gebco_agg_{lat0:+05.0f}.npz"
    if npz.exists():
        d = np.load(npz)
        return d["emax"], d["npos"]
    eps = 0.5 / 240.0  # meia amostra: pega exatamente os centros dentro da faixa
    q = (
        f"elevation%5B({lat0 + eps:.6f}):1:({lat0 + 1 - eps:.6f})%5D"
        f"%5B({LON_MIN + eps:.6f}):1:({LON_MAX - eps:.6f})%5D"
    )
    nc = cache / "faixa.nc"
    for tentativa in range(4):
        try:
            baixar(f"{ERDDAP}?{q}", nc)
            break
        except Exception as exc:  # rede instável: tenta de novo
            print(f"  faixa {lat0}: erro {exc!r}, nova tentativa", file=sys.stderr)
            time.sleep(5 * (tentativa + 1))
    else:
        raise RuntimeError(f"falha ao baixar a faixa {lat0}")
    f = netcdf_file(str(nc), "r", mmap=False)
    lat = f.variables["latitude"][:].copy()
    e = f.variables["elevation"][:].astype(np.int32)
    f.close()
    nc.unlink()
    if lat[0] > lat[-1]:
        e = e[::-1]
    linhas = round(1.0 / CELULA_DEG)
    colunas = round((LON_MAX - LON_MIN) / CELULA_DEG)
    assert e.shape == (linhas * SUB, colunas * SUB), e.shape
    e = np.where(e == 32767, 9999, e)  # _FillValue → tratado como terra (desconhecido)
    blocos = e.reshape(linhas, SUB, colunas, SUB)
    emax = blocos.max(axis=(1, 3)).astype(np.int16)
    npos = (blocos > 0).sum(axis=(1, 3)).astype(np.uint8)
    np.savez_compressed(npz, emax=emax, npos=npos)
    return emax, npos


def poligonos_ne(cache: Path) -> list:
    geoms = []
    for nome in ("ne_10m_land", "ne_10m_minor_islands"):
        z = cache / f"{nome}.zip"
        if not z.exists():
            baixar(NE_URL.format(nome), z)
        with zipfile.ZipFile(z) as zf:
            r = shapefile.Reader(
                shp=zf.open(f"{nome}.shp"), shx=zf.open(f"{nome}.shx"), dbf=zf.open(f"{nome}.dbf")
            )
            recorte = box(LON_MIN - 0.5, LAT_MIN - 0.5, LON_MAX + 0.5, LAT_MAX + 0.5)
            for s in r.shapes():
                g = shape(s.__geo_interface__)
                if g.intersects(recorte):
                    geoms.append(g.intersection(recorte))
    return geoms


def aneis(geom, casas: int) -> list:
    """Polígonos como [[anel externo, buracos...], ...] com coordenadas [lon, lat] arredondadas."""
    out = []
    polys = getattr(geom, "geoms", [geom])
    for p in polys:
        if p.is_empty or p.geom_type != "Polygon":
            continue
        rings = [p.exterior] + list(p.interiors)
        out.append([[[round(x, casas), round(y, casas)] for x, y in r.coords] for r in rings])
    return out


def rle(valores: np.ndarray) -> bytes:
    v = valores.ravel()
    quebras = np.flatnonzero(np.diff(v)) + 1
    inicios = np.concatenate(([0], quebras))
    fins = np.concatenate((quebras, [v.size]))
    out = bytearray()
    for i0, i1 in zip(inicios, fins):
        out.append(int(v[i0]))
        n = int(i1 - i0)
        while True:  # LEB128
            b = n & 0x7F
            n >>= 7
            if n:
                out.append(b | 0x80)
            else:
                out.append(b)
                break
    return bytes(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True, help="pasta para downloads temporários")
    args = ap.parse_args()
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)

    linhas = round((LAT_MAX - LAT_MIN) / CELULA_DEG)
    colunas = round((LON_MAX - LON_MIN) / CELULA_DEG)

    # ── Batimetria GEBCO, faixa a faixa (linha 0 = sul) ──
    emax = np.zeros((linhas, colunas), np.int16)
    npos = np.zeros((linhas, colunas), np.uint8)
    for k, lat0 in enumerate(np.arange(LAT_MIN, LAT_MAX, 1.0)):
        t = time.time()
        a, b = faixa_gebco(float(lat0), cache)
        emax[k * 60:(k + 1) * 60] = a
        npos[k * 60:(k + 1) * 60] = b
        print(f"GEBCO faixa {lat0:+.0f}°: {time.time() - t:.1f}s", flush=True)

    # ── Terra Natural Earth (all_touched = conservador) ──
    geoms = poligonos_ne(cache)
    terra_ne = unary_union(geoms)
    transf = from_origin(LON_MIN, LAT_MAX, CELULA_DEG, CELULA_DEG)  # linha 0 = norte
    mascara_ne = features.rasterize(
        [(mapping(g), 1) for g in geoms], out_shape=(linhas, colunas), transform=transf,
        all_touched=True, dtype="uint8",
    )[::-1]  # → linha 0 = sul

    terra = (mascara_ne > 0) | (npos > 0)
    prof = np.where(emax <= 0, -emax.astype(np.int32), 0)
    classe = 1 + np.zeros_like(prof)
    for lim in LIMIARES_M:
        classe += (prof >= lim).astype(np.int32)
    classe = np.where(terra, 0, classe).astype(np.uint8)

    # ── Grade binária ──
    destino = RAIZ / "public" / "navegacao"
    destino.mkdir(parents=True, exist_ok=True)
    cab = struct.pack(
        "<4sHHdddII", b"PHNV", 1, len(LIMIARES_M), LAT_MIN, LON_MIN, CELULA_DEG, linhas, colunas
    )
    cab += struct.pack(f"<{len(LIMIARES_M)}H", *LIMIARES_M)
    corpo = rle(classe)
    (destino / "grade_costa_br.bin").write_bytes(cab + corpo)
    print(f"grade {linhas}x{colunas}: {len(cab) + len(corpo)} bytes; "
          f"terra {terra.mean():.1%}, NE {np.mean(mascara_ne > 0):.1%}, GEBCO>0 {np.mean(npos > 0):.1%}")

    # ── Linha de costa: resolução original (testes) e simplificada (mapa) ──
    dentro = terra_ne.intersection(box(LON_MIN, LAT_MIN, LON_MAX, LAT_MAX))
    fixture = RAIZ / "scripts" / "fixtures" / "ne10m_terra_costa_br.json"
    fixture.write_text(json.dumps({
        "fonte": "Natural Earth 1:10m land + minor_islands (domínio público), recorte da costa brasileira",
        "bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
        "poligonos": aneis(dentro, 5),
    }, separators=(",", ":")), encoding="utf-8")
    simpl = dentro.simplify(0.01, preserve_topology=True)
    grandes = [p for p in getattr(simpl, "geoms", [simpl]) if p.area > 0.0004]
    (destino / "costa_br.json").write_text(json.dumps({
        "fonte": "Natural Earth 1:10m (domínio público), simplificada para exibição — não usar para navegação",
        "bbox": [LON_MIN, LAT_MIN, LON_MAX, LAT_MAX],
        "poligonos": aneis(unary_union(grandes), 3),
    }, separators=(",", ":")), encoding="utf-8")
    print("fixture", fixture.stat().st_size, "bytes; mapa", (destino / "costa_br.json").stat().st_size, "bytes")


if __name__ == "__main__":
    main()
