# Dron España

App móvil (PWA instalable) para saber **dónde puedes volar tu dron en España** con los datos oficiales de ENAIRE, **a quién pedir permiso** (emails, teléfonos y webs de cada zona) y generar las solicitudes ya rellenadas.

## Qué usa (todo datos reales, sin claves)
| Dato | Fuente |
|---|---|
| Zonas UAS (aeródromos, CTR/ATZ, helipuertos, ferrocarril, vuelo fotográfico) y sus contactos | ENAIRE · servicio AIS arcGIS REST (`SRV_UAS_ZG_data_V2`), ciclo AIRAC de 28 días |
| Normativa | BOE (API de datos abiertos, en directo) |
| Noticias | AESA (RSS) y Google News, filtradas a drones en España → `news.json` |
| Tiempo y altitud del terreno | Open-Meteo |
| Mapa, búsqueda de lugares, aeródromos extra | OpenStreetMap |

## Probarla en tu ordenador
```
python tools/servir.py
```
Abre `http://localhost:8765`. Desde el móvil (misma wifi) usa la dirección que imprime.

## Instalarla en el móvil (y que el GPS funcione)
El navegador solo da la ubicación en **https**. Sube esta carpeta a un hosting estático gratuito con https
(GitHub Pages, Netlify, Cloudflare Pages) y en el móvil: Android → menú → «Instalar app»; iPhone → Compartir → «Añadir a pantalla de inicio».

## Noticias al día, automático
- **Con GitHub Pages:** el flujo `.github/workflows/noticias.yml` actualiza `news.json` cada día solo.
- **En tu PC con Windows:** programa `python tools/actualizar_noticias.py` en el Programador de tareas (a diario).
- Además, la app consulta el **BOE en directo** cada vez que abres Noticias.

## Límites que conviene saber
- ENAIRE, AESA y AENA exigen tu identificación (login o certificado): la app **no puede enviar solicitudes por ti**. Deja el email redactado, la ficha para copiar a Planea, el PDF y los botones de llamada.
- ENAIRE publica **emails** de los aeropuertos grandes y **teléfonos** de muchos helipuertos y aeródromos, pero no de todos. Cuando falta, la app lo dice y ofrece búsqueda.
- La capa «Urbano» de ENAIRE cubre todo el territorio y no delimita pueblos y ciudades: por eso la app te pregunta si estás en casco urbano.
- Información orientativa. Manda siempre la fuente oficial.
