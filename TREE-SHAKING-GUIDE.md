# Tree-shaking: почему Vite вырезает компоненты и как это чинить

Краткая шпаргалка — читать от корки до корки.

## Суть проблемы

Vite (Rollup) анализирует граф импортов и вырезает код, который, по его мнению, никогда не выполняется. Он смотрит на статические импорты и решает: "этот компонент импортируется, но conditional `.js` — никогда не попадёт в рендер". 

**Внимание:** Vite анализирует *файл*, а не рантайм. Если компонент импортирован статически (`import { X } from "./X"`) но используется только внутри `{condition && <X />}` — Vite может вырезать его при сборке, считая что `X` никогда не понадобится.

Как это выглядит:
1. Компонент есть в `import`, TypeScript не ругается
2. В дев-режиме (`npm run dev`) всё работает
3. После `npm run build` — страница пустая или ошибка
4. В `dist/assets/` нет отдельного чанка с этим компонентом (или его нет вообще)

## Способы решения (от лучшего к худшему)

### Способ 1 — React.lazy (dynamic import) ✓ РЕКОМЕНДУЕТСЯ

Vite/Rollup НЕ вырезает dynamic imports — они собираются в отдельные чанки.

```tsx
import { lazy, Suspense } from "react"

const MyPage = lazy(() => import("@/pages/MyPage"))

// Использование:
<Suspense fallback={<div>Загрузка...</div>}>
  {page === "my-page" && <MyPage />}
</Suspense>
```

**Файл компонента должен иметь `export default`:**

```tsx
export default function MyPage() { ... }
// Или в конце файла:
// export default MyPage
```

**ВАЖНО:** ErrorBoundary НЕ должен ловить Suspense-исключения. В `componentDidCatch` обязательно добавить:

```tsx
componentDidCatch(error: Error, info: React.ErrorInfo) {
  if (error.message?.includes("Suspense Exception")) {
    throw error
  }
  console.error("[ErrorBoundary]", error, info.componentStack)
}
```

### Способ 2 — Barrel file (иногда работает)

```ts
// pages/index.ts
export { MyPage } from "./MyPage"
export { OtherPage } from "./OtherPage"
```

```tsx
// App.tsx
import { MyPage, OtherPage } from "@/pages"
```

Vite иногда иначе обрабатывает barrel-экспорты. Но гарантий нет.

### Способ 3 — Явное использование компонента

Добавить что-то, что заставит Vite думать что компонент используется безусловно. Например, передать его как проп в другой компонент или вызвать его фабрику на верхнем уровне.

### Способ 4 — Отдельная точка входа (если ничего не помогает)

Добавить второй `<script>` тег в `index.html`, который грузит отдельно собранный чанк:

```ts
// vite.config.ts
build: {
  rollupOptions: {
    input: {
      main: "index.html",
      tasks: "src/entries/tasks.tsx",
    }
  }
}
```

## Проверка после сборки

```bash
npm run build
ls dist/assets/*.js
# Ищем файлы компонентов:
# ✓ AntonsTasks-XXXXXXXX.js
# ✓ AssistantTasks-XXXXXXXX.js
# Если их нет — tree-shaking сработал
```

## Что делать если страница не загружается после деплоя

1. Открыть консоль браузера (F12)
2. Если ошибка `Minified React error #426` — это Suspense-исключение, которое поймал ErrorBoundary. Фикс: обновить ErrorBoundary (см. Способ 1).
3. Проверить `dist/assets/` — есть ли там чанк с именем компонента
4. Откатиться на предыдущую работающую сборку:
```bash
rm -rf /var/www/crm/dist
cp -r /root/backup-XXXXXX/dist /var/www/crm/dist
```

## Почему не помогают "очевидные" вещи

| Что пробовали | Почему не работает |
|---|---|
| `rollupOptions: { treeshake: false }` | Vite игнорирует эту опцию для conditional-рендера |
| `export function` → `export default` + статический import | Vite всё равно анализирует граф |
| `void (["my-page"] as Page[])` | Vite не смотрит на типы — только на код |
| `console.log(ComponentName)` на уровне модуля | Полезная нагрузка есть, но tree-shaker считает что код недостижим |
| `/* @__PURE__ */` | Это про чистоту функций, не про tree-shaking |

**Корень:** Vite смотрит на *статические импорты*: если файл импортирован но код, который его использует, по мнению анализатора "никогда не выполнится" — файл вырезается. Dynamic import (`import()`) всегда создаёт отдельный чанк, который Vite не трогает.

## Быстрый чеклист при добавлении новой страницы

- [ ] Компонент имеет `export default` (нужно для `lazy()`)
- [ ] В App.tsx импорт через `const Comp = lazy(() => import("..."))`
- [ ] `<Suspense>` оборачивает место рендера
- [ ] ErrorBoundary не ловит "Suspense Exception"
- [ ] `npm run build` → проверить что чанк появился в `dist/assets/`
- [ ] Обновить бэкап после успешного деплоя
