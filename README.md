# Русская Библиотека Вавилона v5

Один алгоритм `ru1`, настоящие координаты, без хранения страниц.

## Добавлено в v5

- страница зала: 4 стены;
- страница стены: 5 полок;
- хлебные крошки;
- точная ссылка на выделение через `data-pos`;
- поиск по текущей странице;
- паспорт библиотеки;
- конвертер адресов;
- история страниц, фраз, залов, стен, полок и томов;
- сохранение находок;
- base36 и base64url.

## Форматы

Страница:

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

Стена:

```text
#/ru1/sector/1/hall/1/wall/1
```

Зал:

```text
#/ru1/sector/1/hall/1
```

Base64url:

```text
#/ru1/a64/<address>
```

Base36:

```text
#/ru1/a36/<address>
```

## Запуск

```bash
python3 -m http.server 8000
```

## GitHub Pages

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```
