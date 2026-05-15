# Русская Библиотека Вавилона v4

В этой версии оставлен один алгоритм `ru1`, без трёх режимов размера.

## Главное

- один алгоритм: `ru1`;
- настоящие координаты страницы;
- страница тома: 410 страниц;
- страница полки: 32 тома;
- история посещений в `localStorage`;
- ссылка на выделенный фрагмент;
- самопроверка алгоритма;
- raw-адреса в двух форматах:
  - `base36`;
  - `base64url` — компактнее для пересылки.

## Форматы ссылок

Координаты:

```text
#/ru1/sector/1/hall/1/wall/1/shelf/1/volume/1/page/1
```

Том:

```text
#/ru1/sector/1/hall/1/wall/1/shelf/1/volume/1
```

Полка:

```text
#/ru1/sector/1/hall/1/wall/1/shelf/1
```

Base36:

```text
#/ru1/a36/<address>
```

Base64url:

```text
#/ru1/a64/<address>
```

Результаты поиска адресов:

```text
#/find?q=фраза&offset=0&count=8&strategy=random
```

Подсветка фрагмента:

```text
?hl=143:37
```

## Локальный запуск

```bash
python3 -m http.server 8000
```

## GitHub Pages

Включить:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```
