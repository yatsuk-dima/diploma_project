# Adaptive Testing System — Frontend

React SPA для системи адаптивного тестування. Два інтерфейси: викладач та студент.

## Зміст

- [Технологічний стек](#технологічний-стек)
- [Структура проекту](#структура-проекту)
- [Швидкий старт](#швидкий-старт)
- [Змінні середовища](#змінні-середовища)
- [Маршрутизація](#маршрутизація)
- [Стан застосунку](#стан-застосунку)
- [API клієнт](#api-клієнт)
- [Компоненти](#компоненти)
- [Сторінки](#сторінки)
- [Docker](#docker)

---

## Технологічний стек

| Компонент | Технологія | Версія |
|---|---|---|
| UI framework | React | 18.3.1 |
| Bundler | Vite | 5.3.3 |
| Routing | React Router v6 | 6.24.0 |
| HTTP client | Axios | 1.7.2 |
| State management | Zustand | 4.5.4 |
| Charts | Recharts | 2.12.7 |
| Drag & Drop | @dnd-kit | 6.1.0 |
| Styling | Tailwind CSS | 3.4.6 |

---

## Структура проекту

```
front/
├── src/
│   ├── main.jsx             # React entry point (BrowserRouter)
│   ├── App.jsx              # Кореневий компонент: ініціалізація сесії, маршрути
│   ├── index.css            # Tailwind directives
│   │
│   ├── api/                 # HTTP-клієнти (один файл = один ресурс)
│   │   ├── client.js        # Axios instance + interceptor (auto-refresh 401)
│   │   ├── events.js        # Pub/sub для 5xx помилок → toast
│   │   ├── auth.js          # login, refresh, logout, me
│   │   ├── users.js         # listUsers, createUser, updateUser, deleteUser
│   │   ├── groups.js        # listGroups, createGroup
│   │   ├── tests.js         # CRUD тестів, publish, assign
│   │   ├── questions.js     # CRUD питань, patchDifficulty
│   │   ├── attempts.js      # startAttempt, getNextQuestion, submitAnswer, …
│   │   ├── review.js        # pendingAnswers, submitReview
│   │   └── analytics.js     # student/group/test analytics
│   │
│   ├── store/
│   │   └── authStore.js     # Zustand: { user, accessToken, setAuth, logout }
│   │
│   ├── components/
│   │   ├── Layout.jsx       # Sidebar-навігація для інструктора
│   │   ├── StudentLayout.jsx # Обгортка сторінок студента
│   │   ├── ProtectedRoute.jsx # Захист маршрутів по ролі
│   │   ├── Modal.jsx        # Модальне вікно
│   │   ├── Pagination.jsx   # Пагінація
│   │   └── Toast.jsx        # Toast-сповіщення (Context + useToast)
│   │
│   └── pages/
│       ├── LoginPage.jsx
│       ├── instructor/
│       │   ├── DashboardPage.jsx
│       │   ├── TestsPage.jsx
│       │   ├── TestEditorPage.jsx
│       │   ├── QuestionEditorPage.jsx   # DnD-сортування питань
│       │   ├── AssignPage.jsx
│       │   ├── AnalyticsPage.jsx        # Recharts графіки
│       │   └── OpenAnswerReviewPage.jsx
│       └── student/
│           ├── DashboardPage.jsx
│           ├── TestingPage.jsx          # Таймер, адаптивне тестування
│           └── ResultsPage.jsx
│
├── public/
├── index.html
├── vite.config.js           # Proxy /api → backend:8000
├── tailwind.config.js
├── postcss.config.js
├── Dockerfile               # Multi-stage: Node build → nginx:alpine serve
├── package.json
└── package-lock.json
```

---

## Швидкий старт

### Варіант 1 — Docker Compose (рекомендовано)

**Передумови:** Docker, Docker Compose

**Крок 1.** Налаштувати змінні середовища:
```bash
cd back
cp .env.example .env
```

**Крок 2.** Збілдити і запустити стек:
```bash
docker compose up -d --build
```

**Крок 3.** Застосувати міграції БД:
```bash
docker compose exec backend alembic upgrade head
```

**Крок 4.** *(опційно)* Завантажити демонстраційні дані:
```bash
docker compose exec backend python seed.py
```

Застосунок доступний на **`http://localhost`**.

> **Важливо:** відкривати саме `http://localhost` (порт 80), а не `npm run dev`.
> Фронт-контейнер вже вбудований і включає проксі `/api → backend:8000`.

---

### Варіант 2 — Локальна розробка (без Docker)

**Передумови:** Node.js 20+, запущений бекенд на `localhost:8000`

**Термінал 1 — фронтенд:**
```bash
cd front
npm install
npm run dev
```

**Термінал 2 — бекенд** (окремо, див. `back/README.md`):
```bash
cd back
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Застосунок доступний на **`http://localhost:3000`**, API проксюється на `http://localhost:8000`.

---

## Змінні середовища

Frontend не потребує `.env` у runtime — всі запити йдуть на той самий origin.

Для локальної розробки проксі у `vite.config.js`:

```js
server: {
  proxy: {
    '/api': { target: 'http://localhost:8000', changeOrigin: true }
  }
}
```

---

## Маршрутизація

```
/                            → RoleRedirect (→ /instructor/dashboard або /student/dashboard)
/login                       → LoginPage

/instructor/dashboard        → DashboardPage        [instructor]
/instructor/tests            → TestsPage            [instructor]
/instructor/tests/new        → TestEditorPage       [instructor]
/instructor/tests/:id/edit   → TestEditorPage       [instructor]
/instructor/tests/:id/questions → QuestionEditorPage [instructor]
/instructor/tests/:id/assign → AssignPage           [instructor]
/instructor/analytics        → AnalyticsPage        [instructor]
/instructor/review           → OpenAnswerReviewPage [instructor]

/student/dashboard           → StudentDashboardPage [student]
/student/tests/:attemptId    → TestingPage          [student]
/student/results/:attemptId  → ResultsPage          [student]
```

`ProtectedRoute` перевіряє `user.role` і редиректить на `/login` якщо не автентифіковано.

---

## Стан застосунку

Zustand `authStore` (`src/store/authStore.js`):

```js
{
  user: null | { id, full_name, login, role, group_id },
  accessToken: null | string,
  setAuth(user, token),
  logout(),
}
```

**Ініціалізація сесії при завантаженні** (`App.jsx`):
1. Читає `refresh_token` з `localStorage`
2. `POST /api/auth/refresh` → новий `access_token`
3. `setAuth(null, token)` → токен у store (щоб interceptor міг його використати)
4. `GET /api/auth/me` → дані user
5. `setAuth(user, token)` → повна автентифікація

---

## API клієнт

### `src/api/client.js`

Axios instance з interceptors:

**Request:** додає `Authorization: Bearer <token>` з Zustand store.

**Response (помилки):**
- `5xx` → `emitApiError()` → toast "Помилка сервера"
- `401` → auto-refresh:
  - Якщо вже refreshing → ставить запит у `pendingQueue`
  - Робить `POST /api/auth/refresh`, повторює всю чергу
  - При помилці refresh → `logout()` + redirect `/login`

```js
import client from './client';

// Усі API-функції виглядають так:
export const listTests = (params) =>
  client.get('/api/tests', { params }).then(r => r.data);
```

### `src/api/events.js`

```js
// Підписка (компонент)
useEffect(() => onApiError(msg => toast(msg, 'error')), []);

// Emit (автоматично при 5xx у client.js)
emitApiError('Помилка сервера. Спробуйте пізніше.');
```

---

## Компоненти

### `Toast.jsx`

Context-based сповіщення. Auto-dismiss за 3 секунди.

```jsx
<ToastProvider>...</ToastProvider>

const toast = useToast();
toast('Збережено!');
toast('Помилка!', 'error');
```

### `Modal.jsx`

React portal. Закривається по Escape або кліку на overlay.

```jsx
<Modal open={open} onClose={close} title="Заголовок">
  <p>Контент</p>
</Modal>
```

### `ProtectedRoute.jsx`

```jsx
<ProtectedRoute role="instructor"><Layout /></ProtectedRoute>
<ProtectedRoute role="student"><StudentDashboardPage /></ProtectedRoute>
```

---

## Сторінки

### Інструктор

**DashboardPage** — статистика: кількість тестів, студентів, незавершених спроб.

**TestsPage** — список тестів з фільтрацією, кнопки публікації, редагування, видалення.

**TestEditorPage** — форма створення/редагування: назва, опис, ліміт часу, максимум спроб.

**QuestionEditorPage** — управління питаннями тесту:
- Три типи: `single_choice`, `multiple_choice`, `open_answer`
- Drag & Drop для зміни порядку (`@dnd-kit/sortable`)
- Ручне встановлення IRT-складності (`irt_difficulty_override`)

**AssignPage** — призначення тесту:
- Пошук студентів або вибір групи
- Встановлення дати початку / дедлайну

**AnalyticsPage** — візуалізація прогресу:
- `LineChart` — динаміка θ (здібність) студента по спробах
- `BarChart` — середні бали по групі

**OpenAnswerReviewPage** — черга відкритих відповідей:
- Перегляд тексту студента + ключових слів
- Виставлення `is_correct` + `score` (0–1)

### Студент

**DashboardPage** — список призначених тестів:
- Показує `Почати` / `Продовжити` / `Вичерпано` залежно від стану

**TestingPage** — проходження тесту:
- Стан-машина: `loading → question → result → finishing`
- **Таймер** `useCountdown`: обраховується від `server_time` (без дрейфу клієнтського годинника)
- **Single choice**: radio buttons з кольоровим feedback (зелений/червоний)
- **Multiple choice**: checkboxes, штраф за зайві відповіді
- **Open answer**: textarea, відповідь відправляється на перевірку
- Між питаннями 1800мс показується результат, потім автоперехід
- `finishingRef` захищає від подвійного виклику `/finish`

**ResultsPage** — результати:
- `ScoreBadge`: зелений ≥80%, жовтий ≥60%, червоний <60%
- Розбір кожної відповіді (правильна/неправильна/на перевірці)
- Банер якщо є відкриті відповіді, що ще перевіряються

---

## Docker

### Dockerfile (multi-stage build)

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # → dist/

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Inline nginx config з SPA fallback (try_files)
EXPOSE 80
```

Фінальний image — лише nginx + статичні файли (~25MB).

### Збірка і запуск

```bash
# Зібрати локально
docker build -t adaptive-frontend .

# Запустити (dev-перевірка)
docker run --rm -p 8080:80 adaptive-frontend
# → http://localhost:8080

# У складі повного стеку (рекомендовано)
cd back && docker compose up -d --build frontend
```

---

## Скрипти

```bash
npm run dev       # Dev-сервер з HMR → http://localhost:5173
npm run build     # Production build → dist/
npm run preview   # Прев'ю production build локально
npm run lint      # ESLint перевірка коду
```
