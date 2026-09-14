import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.database import engine
from app.models import Base
from app.security import hash_password
from app.services import seed_data
from sqlalchemy.orm import Session

if not settings.seed_sample_data:
    print("TicketRush sample data skipped because SEED_SAMPLE_DATA is false.")
else:
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        seed_data(db, settings.admin_email, hash_password(settings.admin_password), hash_password("AdminPass123!"))
    print("TicketRush sample data is ready.")
