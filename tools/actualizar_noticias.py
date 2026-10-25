#!/usr/bin/env python3
"""Genera news.json con noticias y normativa de drones (solo librería estándar).

Fuentes reales:
  - BOE (API de datos abiertos, sumario diario): disposiciones y resoluciones sobre drones / AESA / espacio aéreo.
  - AESA (RSS oficial).
  - Google News (RSS) con búsquedas sobre drones en España.
Uso:  python tools/actualizar_noticias.py        (escribe ../news.json)
Se ejecuta a diario con .github/workflows/noticias.yml o con el Programador de tareas de Windows.
"""
import json, re, sys, html, datetime as dt, urllib.request, urllib.parse
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET

OUT = Path(__file__).resolve().parent.parent / "news.json"
UA = {"User-Agent": "Mozilla/5.0 DronEspana/1.0"}
DIAS_BOE = 21
MAX_ITEMS = 80

BOE_KW = re.compile(r"aeronaves? no tripuladas?|\bdrones?\b|\bUAS\b|\bRPAS\b|pilotadas? por control remoto|"
                    r"Agencia Estatal de Seguridad A[ée]rea|navegaci[óo]n a[ée]rea|espacio a[ée]reo|aeron[áa]utic", re.I)
NORMA_KW = re.compile(r"real decreto|resoluci[óo]n|reglamento|normativa|\bley\b|\bBOE\b|orden |sanci[óo]n|multa|obligatori|"
                      r"registro|autorizaci[óo]n|prohib", re.I)

GNEWS_QUERIES = [
    "drones normativa España",
    "AESA drones",
    "ENAIRE drones zonas",
    "dron prohibido vuelo España multa",
]


RELEVANTE = re.compile(r"\bdrones?\b|\bUAS\b|\bRPAS\b|U-?space|AESA|ENAIRE|aeronaves? no tripuladas?|espacio a[ée]reo", re.I)
RUIDO = re.compile(r"ucrani|rusia|ruso|guerra|misil|bombard|israel|gaza|\bF-?\d{2}\b|ataque|ej[ée]rcito de|defensa antia|OTAN|"
                   r"cartera r[ée]cord|EE\.? ?UU|Estados Unidos|Bulgaria|Amazon|[Ѐ-ӿ؀-ۿ一-鿿]", re.I)


def es_util(title, source):
    if source in ("BOE", "AESA"):
        return True
    return bool(RELEVANTE.search(title)) and not RUIDO.search(title + " " + source)


def get(url, accept="*/*", timeout=40):
    req = urllib.request.Request(url, headers={**UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def clean(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def iso(d):
    return d.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def tag_for(title, source):
    if source == "BOE":
        return "normativa"
    if NORMA_KW.search(title):
        return "normativa"
    return "aesa" if source.startswith("AESA") else "prensa"


def boe():
    items = []
    walk_ok = 0
    def walk(o):
        if isinstance(o, dict):
            if "titulo" in o and "identificador" in o:
                yield o
            for v in o.values():
                yield from walk(v)
        elif isinstance(o, list):
            for v in o:
                yield from walk(v)
    for i in range(DIAS_BOE):
        day = dt.date.today() - dt.timedelta(days=i)
        ds = day.strftime("%Y%m%d")
        try:
            j = json.loads(get(f"https://www.boe.es/datosabiertos/api/boe/sumario/{ds}", "application/json"))
        except Exception:
            continue
        walk_ok += 1
        for it in walk(j["data"]["sumario"]):
            ident = it["identificador"]
            if not ident.startswith("BOE-A-"):  # solo disposiciones; los anuncios (B) son contratos y ruido
                continue
            title = clean(it["titulo"])
            if not BOE_KW.search(title):
                continue
            items.append({
                "title": title, "url": it.get("url_html") or f"https://www.boe.es/buscar/doc.php?id={ident}",
                "source": "BOE", "date": f"{day.isoformat()}T07:00:00Z", "tag": "normativa", "id": ident,
            })
    print(f"BOE: {walk_ok} sumarios leídos, {len(items)} resultados", file=sys.stderr)
    return items


def rss(url, source, default_tag=None, limit=40):
    out = []
    root = ET.fromstring(get(url))
    for it in root.iter("item"):
        title = clean(it.findtext("title"))
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        try:
            d = parsedate_to_datetime(pub)
            if d.tzinfo is None:
                d = d.replace(tzinfo=dt.timezone.utc)
        except Exception:
            d = dt.datetime.now(dt.timezone.utc)
        src = source
        if source == "Google News":  # el título acaba en " - Medio"
            m = re.match(r"^(.*) - ([^-]+)$", title)
            if m:
                title, src = m.group(1).strip(), m.group(2).strip()
        if not es_util(title, source if source != "Google News" else src):
            continue
        summary = clean(it.findtext("description"))[:240]
        if summary.lower().startswith(title.lower()[:30]):  # Google News repite el título como resumen
            summary = ""
        out.append({"title": title, "url": link, "source": src, "date": iso(d),
                    "tag": default_tag or tag_for(title, src), "summary": summary})
        if len(out) >= limit:
            break
    return out


def main():
    items = []
    try:
        items += boe()
    except Exception as e:
        print("BOE falló:", e, file=sys.stderr)
    try:
        items += rss("https://www.seguridadaerea.gob.es/es/rss.xml", "AESA", "aesa", 30)
    except Exception as e:
        print("AESA falló:", e, file=sys.stderr)
    for q in GNEWS_QUERIES:
        try:
            u = "https://news.google.com/rss/search?" + urllib.parse.urlencode(
                {"q": q + " when:30d", "hl": "es", "gl": "ES", "ceid": "ES:es"})
            items += rss(u, "Google News", None, 25)
        except Exception as e:
            print("Google News falló:", q, e, file=sys.stderr)

    seen, uniq = set(), []
    for it in sorted(items, key=lambda x: x["date"], reverse=True):
        k = re.sub(r"\W+", "", it["title"].lower())[:80]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(it)
    uniq = uniq[:MAX_ITEMS]

    # Si todo falló, no machacamos un news.json bueno con uno vacío.
    if not uniq and OUT.exists():
        print("Sin resultados: se conserva el news.json anterior", file=sys.stderr)
        return 1
    OUT.write_text(json.dumps({"generated": iso(dt.datetime.now(dt.timezone.utc)), "count": len(uniq), "items": uniq},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {len(uniq)} noticias -> {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
