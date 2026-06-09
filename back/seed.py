"""
Seed script — заповнює БД демонстраційними даними.

Запуск:
    docker compose exec backend python seed.py

Структура:
  - 1 адміністратор  (admin / Admin123!)
  - 3 дисципліни
  - 3 викладачі       (кожен прив'язаний до своєї дисципліни)
  - 2 групи           прив'язані до дисциплін
  - 10 курсантів      (по 5 на групу, пароль: Student123!)
  - 6 тестів          з кодами занять (Л-1.1, Г/з-1.2 тощо)
  - симуляція спроб
"""

import random
import uuid
from datetime import datetime, timedelta, timezone

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SyncSessionLocal
from app.models.answer import Answer
from app.models.attempt import Attempt
from app.models.attempt_question import AttemptQuestion
from app.models.discipline import Discipline
from app.models.group import Group
from app.models.question import Question
from app.models.test import Test
from app.models.user import User

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
rng = random.Random(42)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ago(days=0, hours=0) -> datetime:
    return now_utc() - timedelta(days=days, hours=hours)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_or_create_discipline(db: Session, name: str, description: str) -> Discipline:
    d = db.execute(select(Discipline).where(Discipline.name == name)).scalar_one_or_none()
    if not d:
        d = Discipline(id=uuid.uuid4(), name=name, description=description)
        db.add(d)
        db.flush()
        print(f"  + Дисципліна: {name}")
    return d


def get_or_create_group(db: Session, name: str) -> Group:
    g = db.execute(select(Group).where(Group.name == name)).scalar_one_or_none()
    if not g:
        g = Group(id=uuid.uuid4(), name=name)
        db.add(g)
        db.flush()
        print(f"  + Група: {name}")
    return g


def get_or_create_user(db: Session, login: str, full_name: str, role: str,
                        password: str, group_id=None, discipline=None) -> User:
    user = db.execute(select(User).where(User.login == login)).scalar_one_or_none()
    if not user:
        user = User(
            id=uuid.uuid4(),
            full_name=full_name,
            login=login,
            password_hash=pwd.hash(password),
            role=role,
            group_id=group_id,
            is_active=True,
        )
        if discipline:
            user.disciplines = [discipline]
        db.add(user)
        db.flush()
        print(f"  + {role.upper()}: {login}  ({full_name})")
    return user


def create_test(db: Session, instructor_id: uuid.UUID, discipline_id: uuid.UUID,
                title: str, description: str, lesson_code: str,
                time_limit: int | None, max_attempts: int) -> Test:
    test = Test(
        id=uuid.uuid4(),
        title=title,
        description=description,
        discipline_id=discipline_id,
        lesson_code=lesson_code,
        created_by=instructor_id,
        time_limit_minutes=time_limit,
        max_attempts=max_attempts,
        is_published=True,
    )
    db.add(test)
    db.flush()
    return test


def add_question(db: Session, test_id: uuid.UUID, qtype: str, text: str,
                 options, correct_answer: dict, order: int,
                 difficulty: float | None = None,
                 difficulty_level: str | None = None) -> Question:
    q = Question(
        id=uuid.uuid4(),
        test_id=test_id,
        type=qtype,
        text=text,
        options=options,
        correct_answer=correct_answer,
        order=order,
        irt_difficulty_override=difficulty,
        difficulty_level=difficulty_level,
        irt_response_count=0,
    )
    db.add(q)
    db.flush()
    return q


def simulate_attempt(db: Session, test: Test, questions: list[Question],
                     student: User, attempt_number: int, started_at: datetime,
                     skill_level: float = 0.5, force_open_pending: bool = False) -> Attempt:
    time_spent = rng.randint(8, test.time_limit_minutes * 60 if test.time_limit_minutes else 1200)
    finished_at = started_at + timedelta(seconds=time_spent)

    attempt = Attempt(
        id=uuid.uuid4(),
        test_id=test.id,
        student_id=student.id,
        attempt_number=attempt_number,
        theta=rng.uniform(-1.5, 1.5),
        status="completed",
        started_at=started_at,
        finished_at=finished_at,
        time_spent_seconds=time_spent,
        pending_review_count=0,
    )
    db.add(attempt)
    db.flush()

    total_score = 0.0
    pending = 0

    for pos, q in enumerate(questions):
        aq = AttemptQuestion(
            id=uuid.uuid4(),
            attempt_id=attempt.id,
            question_id=q.id,
            position=pos,
            is_answered=True,
        )
        db.add(aq)

        difficulty = q.irt_difficulty_override or 0.0
        p_correct = 1 / (1 + pow(2.718, -(skill_level * 3 - difficulty)))
        correct = rng.random() < p_correct

        if q.type == "single_choice":
            opts = q.options or []
            correct_id = q.correct_answer.get("option_id")
            if correct:
                student_ans = {"option_id": correct_id}
                is_correct, score = True, 1.0
            else:
                wrong = [o["id"] for o in opts if o["id"] != correct_id]
                chosen = rng.choice(wrong) if wrong else correct_id
                student_ans = {"option_id": chosen}
                is_correct, score = False, 0.0

        elif q.type == "multiple_choice":
            correct_ids = set(q.correct_answer.get("option_ids", []))
            all_ids = [o["id"] for o in (q.options or [])]
            if correct and correct_ids:
                student_ids = list(correct_ids)
                is_correct, score = True, 1.0
            else:
                wrong_ids = [i for i in all_ids if i not in correct_ids]
                chosen = list(rng.sample(list(correct_ids), min(len(correct_ids), rng.randint(0, len(correct_ids)))))
                if wrong_ids:
                    chosen.append(rng.choice(wrong_ids))
                student_ids = chosen or all_ids[:1]
                n_correct = len(set(student_ids) & correct_ids)
                n_wrong = len(set(student_ids) - correct_ids)
                score = max(0.0, n_correct / len(correct_ids) - n_wrong * 0.5 / len(correct_ids)) if correct_ids else 0.0
                is_correct = (n_correct == len(correct_ids) and n_wrong == 0)
            student_ans = {"option_ids": student_ids}

        else:  # open_answer
            keywords = q.correct_answer.get("keywords", [])
            if force_open_pending:
                n_kw = rng.randint(0, len(keywords))
                used = rng.sample(keywords, n_kw) if keywords else []
                filler = ["у загальному випадку", "на мою думку", "це можна пояснити"]
                text_parts = used + rng.sample(filler, min(len(filler), rng.randint(1, 2)))
                student_ans = {"text": " ".join(text_parts) + "."}
                auto_score = round(n_kw / len(keywords), 4) if keywords else 1.0
                db.add(Answer(
                    id=uuid.uuid4(), attempt_id=attempt.id, question_id=q.id,
                    student_answer=student_ans, is_correct=None, score=auto_score,
                ))
                pending += 1
                total_score += auto_score
                continue
            else:
                if correct:
                    text_ans = " ".join(keywords[:3]) + ". Використовується на практиці."
                    auto_score, is_correct = 1.0, True
                else:
                    text_ans = "Потрібно додаткове вивчення."
                    auto_score, is_correct = 0.0, False
                student_ans = {"text": text_ans}
                score = auto_score

        db.add(Answer(
            id=uuid.uuid4(), attempt_id=attempt.id, question_id=q.id,
            student_answer=student_ans, is_correct=is_correct, score=score,
        ))
        total_score += score

    attempt.pending_review_count = pending
    total_q = len(questions)
    attempt.score = round((total_score / total_q) * 100, 2) if total_q else 0.0
    attempt.max_score = 100.0
    db.flush()
    return attempt


# ---------------------------------------------------------------------------
# Test builders
# ---------------------------------------------------------------------------

def build_network_lecture(db, instructor_id, disc_id):
    """Л-1.1 — Мережеві технології: теоретичний тест."""
    test = create_test(db, instructor_id, disc_id,
        title="Л-1.1 Основи мережевих технологій",
        description="Модель OSI, TCP/IP, адресація, протоколи L3/L4.",
        lesson_code="Л-1.1", time_limit=30, max_attempts=3)
    qs = []
    opt = lambda t: {"id": str(uuid.uuid4()), "text": t}

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice", "Скільки рівнів містить модель OSI?",
        [{"id": a,"text":"4"}, {"id": b,"text":"5"}, {"id": c,"text":"7"}, {"id": d,"text":"8"}],
        {"option_id": c}, 0, -1.5, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Який протокол забезпечує надійну доставку з підтвердженням?",
        [{"id": a,"text":"UDP"}, {"id": b,"text":"TCP"}, {"id": c,"text":"ICMP"}, {"id": d,"text":"ARP"}],
        {"option_id": b}, 1, -1.0, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice", "Яка маска підмережі відповідає /24?",
        [{"id": a,"text":"255.0.0.0"}, {"id": b,"text":"255.255.0.0"},
         {"id": c,"text":"255.255.255.0"}, {"id": d,"text":"255.255.255.128"}],
        {"option_id": c}, 2, -0.5, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "multiple_choice",
        "Які з наведених є протоколами прикладного рівня (L7)?",
        [{"id": a,"text":"HTTP"}, {"id": b,"text":"TCP"}, {"id": c,"text":"FTP"}, {"id": d,"text":"IP"}],
        {"option_ids": [a, c]}, 3, 0.2, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice", "Яке призначення протоколу ARP?",
        [{"id": a,"text":"Маршрутизація пакетів"}, {"id": b,"text":"Зіставлення IP з MAC"},
         {"id": c,"text":"Шифрування трафіку"}, {"id": d,"text":"DNS-розподільник"}],
        {"option_id": b}, 4, 0.0, "medium"))

    qs.append(add_question(db, test.id, "open_answer",
        "Опишіть процес тристороннього рукостискання TCP (three-way handshake).",
        None, {"keywords": ["syn", "ack", "synack", "handshake", "з'єднання"], "min_match": 2},
        5, 1.0, "hard"))

    print(f"  + Тест: {test.lesson_code} «{test.title}» ({len(qs)} питань)")
    return test, qs


def build_network_practical(db, instructor_id, disc_id):
    """Г/з-1.2 — Мережеві технології: практичне заняття."""
    test = create_test(db, instructor_id, disc_id,
        title="Г/з-1.2 Налаштування мережевих протоколів",
        description="Практичні задачі з підмережування, маршрутизації та налагодження.",
        lesson_code="Г/з-1.2", time_limit=40, max_attempts=2)
    qs = []

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Скільки хостів можна розмістити в мережі /28?",
        [{"id": a,"text":"14"}, {"id": b,"text":"16"}, {"id": c,"text":"30"}, {"id": d,"text":"254"}],
        {"option_id": a}, 0, 0.5, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яка команда перевіряє доступність вузла мережі?",
        [{"id": a,"text":"tracert"}, {"id": b,"text":"nslookup"}, {"id": c,"text":"ping"}, {"id": d,"text":"netstat"}],
        {"option_id": c}, 1, -1.5, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "multiple_choice",
        "Які адреси є приватними (RFC 1918)?",
        [{"id": a,"text":"10.0.0.1"}, {"id": b,"text":"172.16.5.10"},
         {"id": c,"text":"192.168.1.1"}, {"id": d,"text":"8.8.8.8"}],
        {"option_ids": [a, b, c]}, 2, 0.5, "medium"))

    qs.append(add_question(db, test.id, "open_answer",
        "Що таке NAT і яке його основне призначення в сучасних мережах?",
        None, {"keywords": ["nat", "трансляція", "приватний", "публічний", "адреса"], "min_match": 2},
        3, 1.2, "hard"))

    print(f"  + Тест: {test.lesson_code} «{test.title}» ({len(qs)} питань)")
    return test, qs


def build_crypto_lecture(db, instructor_id, disc_id):
    """Л-2.1 — Захист інформації: лекція."""
    test = create_test(db, instructor_id, disc_id,
        title="Л-2.1 Основи криптографії",
        description="Симетричне та асиметричне шифрування, хеш-функції, PKI.",
        lesson_code="Л-2.1", time_limit=None, max_attempts=2)
    qs = []

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Який алгоритм є симетричним шифруванням?",
        [{"id": a,"text":"RSA"}, {"id": b,"text":"AES"}, {"id": c,"text":"ECDSA"}, {"id": d,"text":"Diffie-Hellman"}],
        {"option_id": b}, 0, -1.0, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice", "Яка довжина хешу SHA-256?",
        [{"id": a,"text":"128 біт"}, {"id": b,"text":"160 біт"},
         {"id": c,"text":"256 біт"}, {"id": d,"text":"512 біт"}],
        {"option_id": c}, 1, -0.5, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice", "Що таке цифровий підпис?",
        [{"id": a,"text":"Зашифрований хеш документа приватним ключем"},
         {"id": b,"text":"Пароль, зашифрований публічним ключем"},
         {"id": c,"text":"Симетричний ключ"}, {"id": d,"text":"SSL-сертифікат сервера"}],
        {"option_id": a}, 2, 0.3, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "multiple_choice",
        "Які з наведених є асиметричними алгоритмами?",
        [{"id": a,"text":"AES"}, {"id": b,"text":"RSA"}, {"id": c,"text":"ECC"}, {"id": d,"text":"3DES"}],
        {"option_ids": [b, c]}, 3, 0.5, "medium"))

    qs.append(add_question(db, test.id, "open_answer",
        "Поясніть різницю між симетричним і асиметричним шифруванням. Наведіть приклади.",
        None, {"keywords": ["симетричний", "асиметричний", "ключ", "aes", "rsa", "швидкість"], "min_match": 3},
        4, 1.2, "hard"))

    qs.append(add_question(db, test.id, "open_answer",
        "Що таке PKI і які компоненти вона включає?",
        None, {"keywords": ["pki", "сертифікат", "ca", "центр", "публічний", "ключ"], "min_match": 2},
        5, 1.8, "hard"))

    print(f"  + Тест: {test.lesson_code} «{test.title}» ({len(qs)} питань)")
    return test, qs


def build_crypto_practical(db, instructor_id, disc_id):
    """Г/з-2.2 — Захист інформації: практика."""
    test = create_test(db, instructor_id, disc_id,
        title="Г/з-2.2 Практика захисту інформації",
        description="Аналіз атак, налаштування firewall, аудит безпеки.",
        lesson_code="Г/з-2.2", time_limit=35, max_attempts=3)
    qs = []

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яку проблему вирішує протокол Діффі-Геллмана?",
        [{"id": a,"text":"Шифрування великих файлів"},
         {"id": b,"text":"Безпечний обмін ключами через незахищений канал"},
         {"id": c,"text":"Аутентифікація користувачів"}, {"id": d,"text":"Генерація підписів"}],
        {"option_id": b}, 0, 0.8, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "multiple_choice",
        "Які заходи належать до захисту інформаційної системи?",
        [{"id": a,"text":"Firewall"}, {"id": b,"text":"IDS/IPS"},
         {"id": c,"text":"Регулярне резервне копіювання"}, {"id": d,"text":"Ігнорування патчів"}],
        {"option_ids": [a, b, c]}, 1, 0.3, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Що таке атака типу 'Man-in-the-Middle'?",
        [{"id": a,"text":"Перевантаження сервера запитами"},
         {"id": b,"text":"Перехоплення та підміна трафіку між двома сторонами"},
         {"id": c,"text":"Підбір паролів"}, {"id": d,"text":"SQL-ін'єкція"}],
        {"option_id": b}, 2, 0.0, "medium"))

    qs.append(add_question(db, test.id, "open_answer",
        "Опишіть принцип роботи атаки SQL-ін'єкція та способи захисту від неї.",
        None, {"keywords": ["sql", "ін'єкція", "параметр", "фільтрація", "prepared", "statement"], "min_match": 2},
        3, 1.5, "hard"))

    print(f"  + Тест: {test.lesson_code} «{test.title}» ({len(qs)} питань)")
    return test, qs


def build_linux_lecture(db, instructor_id, disc_id):
    """Л-3.1 — ОС Linux: лекція."""
    test = create_test(db, instructor_id, disc_id,
        title="Л-3.1 Операційні системи Linux",
        description="Файлова система, права доступу, процеси, bash-основи.",
        lesson_code="Л-3.1", time_limit=45, max_attempts=3)
    qs = []

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яка команда відображає поточний робочий каталог?",
        [{"id": a,"text":"ls"}, {"id": b,"text":"pwd"}, {"id": c,"text":"cd"}, {"id": d,"text":"dir"}],
        {"option_id": b}, 0, -2.0, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Що означає права доступу '755' у Linux?",
        [{"id": a,"text":"Власник: rwx, Група: r-x, Інші: r-x"},
         {"id": b,"text":"Власник: rwx, Група: rwx, Інші: r-x"},
         {"id": c,"text":"Власник: r-x, Група: r-x, Інші: r-x"},
         {"id": d,"text":"Власник: rw-, Група: r-x, Інші: r-x"}],
        {"option_id": a}, 1, -0.5, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "multiple_choice",
        "Які команди використовуються для перегляду вмісту файлів?",
        [{"id": a,"text":"cat"}, {"id": b,"text":"less"}, {"id": c,"text":"mkdir"}, {"id": d,"text":"head"}],
        {"option_ids": [a, b, d]}, 2, 0.0, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яка команда показує запущені процеси в реальному часі?",
        [{"id": a,"text":"ps"}, {"id": b,"text":"jobs"}, {"id": c,"text":"top"}, {"id": d,"text":"kill"}],
        {"option_id": c}, 3, -1.5, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Що таке демон (daemon) в Linux?",
        [{"id": a,"text":"Шкідлива програма"},
         {"id": b,"text":"Фонова служба без взаємодії з користувачем"},
         {"id": c,"text":"Команда для управління правами"}, {"id": d,"text":"Системний виклик ядра"}],
        {"option_id": b}, 4, -0.3, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яка команда змінює власника файлу?",
        [{"id": a,"text":"chmod"}, {"id": b,"text":"chown"}, {"id": c,"text":"chgrp"}, {"id": d,"text":"umask"}],
        {"option_id": b}, 5, -0.8, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яка команда показує використання дискового простору?",
        [{"id": a,"text":"du"}, {"id": b,"text":"ls -s"}, {"id": c,"text":"df -h"}, {"id": d,"text":"free -h"}],
        {"option_id": c}, 6, -1.0, "easy"))

    qs.append(add_question(db, test.id, "open_answer",
        "Поясніть різницю між командами 'kill' і 'kill -9'. Коли слід використовувати кожну?",
        None, {"keywords": ["sigterm", "sigkill", "завершення", "примусово", "сигнал", "процес"], "min_match": 2},
        7, 0.8, "hard"))

    print(f"  + Тест: {test.lesson_code} «{test.title}» ({len(qs)} питань)")
    return test, qs


def build_linux_practical(db, instructor_id, disc_id):
    """Г/з-3.2 — ОС Linux: практика."""
    test = create_test(db, instructor_id, disc_id,
        title="Г/з-3.2 Адміністрування Linux",
        description="Практичні навички: налаштування сервісів, bash-скрипти, cron.",
        lesson_code="Г/з-3.2", time_limit=50, max_attempts=2)
    qs = []

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "multiple_choice",
        "Які менеджери пакетів є стандартними для Linux?",
        [{"id": a,"text":"apt (Debian/Ubuntu)"}, {"id": b,"text":"yum/dnf (RHEL/CentOS)"},
         {"id": c,"text":"winget (Windows)"}, {"id": d,"text":"pacman (Arch)"}],
        {"option_ids": [a, b, d]}, 0, 0.3, "medium"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Що виконує 'grep -r \"error\" /var/log/'?",
        [{"id": a,"text":"Видаляє рядки з 'error'"},
         {"id": b,"text":"Рекурсивно шукає 'error' у /var/log/"},
         {"id": c,"text":"Підраховує файли у /var/log/"},
         {"id": d,"text":"Перейменовує файли що містять 'error'"}],
        {"option_id": b}, 1, -0.6, "easy"))

    a, b, c, d = [str(uuid.uuid4()) for _ in range(4)]
    qs.append(add_question(db, test.id, "single_choice",
        "Яка команда перенаправляє стандартну помилку у файл?",
        [{"id": a,"text":"cmd > file.txt"}, {"id": b,"text":"cmd 2> file.txt"},
         {"id": c,"text":"cmd < file.txt"}, {"id": d,"text":"cmd >> file.txt"}],
        {"option_id": b}, 2, 0.5, "medium"))

    qs.append(add_question(db, test.id, "open_answer",
        "Що таке cron і як написати завдання для запуску скрипту щодня о 3:00?",
        None, {"keywords": ["cron", "crontab", "0 3", "розклад", "планувальник"], "min_match": 2},
        3, 1.3, "hard"))

    print(f"  + Тест: {test.lesson_code} «{test.title}» ({len(qs)} питань)")
    return test, qs


# ---------------------------------------------------------------------------
# Main seed
# ---------------------------------------------------------------------------

def seed() -> None:
    db: Session = SyncSessionLocal()
    try:
        print("\n── Дисципліни ────────────────────────────────────────")
        disc_net = get_or_create_discipline(db,
            "Мережеві технології та протоколи",
            "Вивчення комп'ютерних мереж: моделі OSI/TCP-IP, маршрутизація, протоколи.")
        disc_sec = get_or_create_discipline(db,
            "Захист інформації та кібербезпека",
            "Криптографія, захист від атак, PKI, практичний аудит безпеки.")
        disc_os = get_or_create_discipline(db,
            "Операційні системи та адміністрування",
            "Адміністрування Linux/Windows, bash-скрипти, системні сервіси.")
        db.commit()

        print("\n── Групи ─────────────────────────────────────────────")
        g1 = get_or_create_group(db, "Взвод 101")
        g2 = get_or_create_group(db, "Взвод 102")
        db.commit()

        # Прив'язка груп до дисциплін через ORM
        # Взвод 101 → Мережеві + Захист
        # Взвод 102 → Захист + ОС
        for disc, label in [(disc_net, "Мережеві"), (disc_sec, "Захист")]:
            if g1 not in disc.groups:
                disc.groups.append(g1)
                print(f"  + Взвод 101 → {label}")
        for disc, label in [(disc_sec, "Захист"), (disc_os, "ОС")]:
            if g2 not in disc.groups:
                disc.groups.append(g2)
                print(f"  + Взвод 102 → {label}")
        db.commit()

        print("\n── Адміністратор та викладачі ────────────────────────")
        admin = get_or_create_user(db, "admin", "Адміністратор системи", "admin", "Admin123!")

        instr_net = get_or_create_user(db, "kovalenko_iv",
            "Коваленко Іван Петрович", "instructor", "Instructor1!",
            discipline=disc_net)
        instr_sec = get_or_create_user(db, "petrov_mv",
            "Петров Михайло Вікторович", "instructor", "Instructor2!",
            discipline=disc_sec)
        instr_os = get_or_create_user(db, "melnyk_op",
            "Мельник Олексій Петрович", "instructor", "Instructor3!",
            discipline=disc_os)
        db.commit()

        print("\n── Курсанти ──────────────────────────────────────────")
        students_101 = [
            get_or_create_user(db, "petrov_s",    "Петров Сергій Олексійович",    "student", "Student123!", g1.id),
            get_or_create_user(db, "kovalenko_m", "Коваленко Михайло Вікторович", "student", "Student123!", g1.id),
            get_or_create_user(db, "shevchenko_o","Шевченко Олег Андрійович",     "student", "Student123!", g1.id),
            get_or_create_user(db, "melnyk_v",    "Мельник Василь Іванович",      "student", "Student123!", g1.id),
            get_or_create_user(db, "bondarenko_d","Бондаренко Денис Романович",   "student", "Student123!", g1.id),
        ]
        students_102 = [
            get_or_create_user(db, "kravchenko_a","Кравченко Андрій Миколайович", "student", "Student123!", g2.id),
            get_or_create_user(db, "tkachenko_i", "Ткаченко Ігор Степанович",     "student", "Student123!", g2.id),
            get_or_create_user(db, "lysenko_p",   "Лисенко Павло Олексійович",    "student", "Student123!", g2.id),
            get_or_create_user(db, "marchenko_n", "Марченко Наталія Іванівна",    "student", "Student123!", g2.id),
            get_or_create_user(db, "savchenko_y", "Савченко Юрій Петрович",       "student", "Student123!", g2.id),
        ]
        db.commit()

        print("\n── Тести та питання ──────────────────────────────────")
        # Мережеві технології (видимі Взводу 101)
        net_l, net_lq  = build_network_lecture(db, instr_net.id, disc_net.id)
        net_g, net_gq  = build_network_practical(db, instr_net.id, disc_net.id)
        # Захист (видимі обом взводам)
        sec_l, sec_lq  = build_crypto_lecture(db, instr_sec.id, disc_sec.id)
        sec_g, sec_gq  = build_crypto_practical(db, instr_sec.id, disc_sec.id)
        # ОС Linux (видимі Взводу 102)
        os_l, os_lq    = build_linux_lecture(db, instr_os.id, disc_os.id)
        os_g, os_gq    = build_linux_practical(db, instr_os.id, disc_os.id)
        db.commit()

        print("\n── Симуляція спроб ───────────────────────────────────")
        skill_101 = dict(zip(students_101, [0.85, 0.65, 0.50, 0.40, 0.25]))
        skill_102 = dict(zip(students_102, [0.80, 0.70, 0.55, 0.45, 0.30]))

        # Взвод 101: Мережеві тести (Л-1.1 + Г/з-1.2)
        for i, s in enumerate(students_101):
            sk = skill_101[s]
            for test, qs in [(net_l, net_lq), (net_g, net_gq)]:
                t1 = ago(days=rng.randint(15, 25), hours=rng.randint(8, 18))
                simulate_attempt(db, test, qs, s, 1, t1, sk * 0.8, force_open_pending=(i == 0))
                if sk >= 0.5:
                    simulate_attempt(db, test, qs, s, 2, t1 + timedelta(days=3), sk)
        db.commit()
        print(f"  + Мережеві: {len(students_101)} курсантів (Взвод 101)")

        # Взвод 101 + 102: Захист (Л-2.1)
        for i, s in enumerate(students_101 + students_102):
            sk = ({**skill_101, **skill_102})[s]
            t1 = ago(days=rng.randint(8, 14), hours=rng.randint(9, 17))
            simulate_attempt(db, sec_l, sec_lq, s, 1, t1, sk * 0.75, force_open_pending=(i in [1, 6]))
            if sk >= 0.6:
                simulate_attempt(db, sec_l, sec_lq, s, 2, t1 + timedelta(days=4), sk * 1.1)
        db.commit()
        print(f"  + Захист (Л-2.1): 10 курсантів (обидва взводи)")

        # Взвод 102: ОС Linux (Л-3.1 + Г/з-3.2)
        for i, s in enumerate(students_102):
            sk = skill_102[s]
            for test, qs in [(os_l, os_lq), (os_g, os_gq)]:
                t1 = ago(days=rng.randint(3, 7), hours=rng.randint(10, 20))
                simulate_attempt(db, test, qs, s, 1, t1, sk * 0.7, force_open_pending=(i in [1, 3]))
        db.commit()
        print(f"  + ОС Linux: {len(students_102)} курсантів (Взвод 102)")

        print("\n" + "═" * 60)
        print("  SEED ЗАВЕРШЕНО")
        print("═" * 60)
        print("  АДМІН        admin          / Admin123!")
        print("  Викладачі:")
        print("    Мережеві   kovalenko_iv   / Instructor1!")
        print("    Захист     petrov_mv      / Instructor2!")
        print("    ОС Linux   melnyk_op      / Instructor3!")
        print("  Курсанти (пароль: Student123!):")
        print("    Взвод 101  petrov_s, kovalenko_m, shevchenko_o, melnyk_v, bondarenko_d")
        print("    Взвод 102  kravchenko_a, tkachenko_i, lysenko_p, marchenko_n, savchenko_y")
        print("═" * 60 + "\n")

    except Exception as exc:
        db.rollback()
        print(f"\n[ERROR] {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
