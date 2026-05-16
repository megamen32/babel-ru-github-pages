
---
Task ID: inhabited-atlas
Agent: main
Task: Add inhabited layer (5 new genres, classifier, region atlas) to Library of Babel

Work Log:
- Added 5 new filler modes: dialogue, post, diary, log, human
- Added page classifier (classifyPageText) with pattern detection for chat/log/post/diary
- Added region classifier (classifyRegion) - stable genre per hex coordinate
- Updated worker.js with self-contained copies of all new generators
- Updated search UI from 3 to 8 mode buttons
- Updated all 5 theme headers to show region genre (icon + label)
- Updated About page with inhabited atlas description
- Fixed classification patterns for lowercase-normalized text (am/pm, t in ISO timestamps)
- Tested all generators and classifiers

Stage Summary:
- Library math is UNCHANGED — inhabited layer is purely additive
- 8 search modes: Пустота, 💬 Диалог, 📱 Пост, 🔔 Дневник, ⌨️ Лог, Слова, Шум, 🧑 Человек
- Each (x,y) hex coordinate maps to stable region genre
- Page classification: Переписка 95%, Лог 90%, Пост 85%, Дневник 85%, Текст 60%, Шум 20%
- Pushed to GitHub
