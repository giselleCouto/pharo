"""
Valida arquivos RTZ contra os esquemas XSD oficiais (RTZ 1.0 — IEC 61174 Ed.4.0:2015; RTZ 1.2 —
IEC PAS 61174-1:2021), publicados pelo CIRM em https://www.cirm.org/rtz-xml-schemas.

Os XSD não são versionados neste repositório: são baixados do CIRM para a pasta de cache na
primeira execução (ou lidos dela, se já estiverem lá).

Uso:
  python scripts/navegacao/validar_rtz_xsd.py --cache <pasta> arquivo1.rtz [arquivo2.rtz ...]
Saída: uma linha por arquivo; código 0 se todos válidos, 1 se algum inválido, 2 se não foi possível
obter os XSD (sem rede) ou se o lxml não estiver instalado.
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

XSD = {
    "http://www.cirm.org/RTZ/1/0": (
        "RTZ_Schema_version_1_0.xsd",
        "https://www.cirm.org/storage/documents/October2022/89BFadcfAkMCyJwnMWZI.xsd",
    ),
    "http://www.cirm.org/RTZ/1/2": (
        "RTZ_Schema_version_1_2.xsd",
        "https://www.cirm.org/storage/documents/October2022/bWjrTyyfNGseK9ch3TKf.xsd",
    ),
}


def obter_xsd(cache: Path, ns: str) -> Path:
    nome, url = XSD[ns]
    destino = cache / nome
    if not destino.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "pharos-validar-rtz/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            dados = r.read()
        if b"<xsd:schema" not in dados:
            raise RuntimeError(f"resposta inesperada ao baixar {url}")
        destino.write_bytes(dados)
    return destino


def main() -> int:
    try:
        from lxml import etree
    except ImportError:
        print("SKIP: lxml não instalado (pip install lxml)")
        return 2
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("arquivos", nargs="+")
    a = ap.parse_args()
    cache = Path(a.cache)
    cache.mkdir(parents=True, exist_ok=True)
    esquemas: dict[str, object] = {}
    ok = True
    for arq in a.arquivos:
        doc = etree.parse(arq)
        ns = etree.QName(doc.getroot()).namespace
        if ns not in XSD:
            print(f"INVÁLIDO {arq}: namespace desconhecido {ns!r}")
            ok = False
            continue
        if ns not in esquemas:
            try:
                esquemas[ns] = etree.XMLSchema(etree.parse(str(obter_xsd(cache, ns))))
            except Exception as exc:  # sem rede
                print(f"SKIP: não foi possível obter o XSD de {ns}: {exc}")
                return 2
        esquema = esquemas[ns]
        if esquema.validate(doc):
            print(f"OK       {arq} ({XSD[ns][0]})")
        else:
            ok = False
            print(f"INVÁLIDO {arq} ({XSD[ns][0]})")
            for e in esquema.error_log:
                print(f"   linha {e.line}: {e.message}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
