import uuid

import click
from passlib.context import CryptContext

from app.database import SyncSessionLocal
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@click.group()
def cli() -> None:
    pass


@cli.command("create-instructor")
@click.option("--login", required=True, help="Логін")
@click.option("--password", required=True, help="Пароль")
@click.option("--name", required=True, help="Повне ім'я")
def create_instructor(login: str, password: str, name: str) -> None:
    """Створити акаунт інструктора."""
    db = SyncSessionLocal()
    try:
        if db.query(User).filter(User.login == login).first():
            click.echo(f"Помилка: користувач '{login}' вже існує", err=True)
            raise SystemExit(1)

        user = User(
            id=uuid.uuid4(),
            full_name=name,
            login=login,
            password_hash=pwd_context.hash(password),
            role="instructor",
            is_active=True,
        )
        db.add(user)
        db.commit()
        click.echo(f"Інструктора '{login}' створено (id={user.id})")
    finally:
        db.close()


if __name__ == "__main__":
    cli()
