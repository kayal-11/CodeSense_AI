from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from database.base import Base


class Review(Base):
    __tablename__ = 'reviews'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True, index=True)
    filename = Column(String, nullable=False, default='example.py')
    language = Column(String, nullable=False, default='python')
    score = Column(Integer, nullable=False, default=100)
    risk = Column(String, nullable=False, default='Low')
    findings_count = Column(Integer, nullable=False, default=0)
    summary = Column(Text, nullable=True)
    code = Column(Text, nullable=True)
    report_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)

