from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


@router.post('/')
def upload_file(
    file: Annotated[UploadFile, File(...)],
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    destination = Path('uploads') / file.filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('wb') as fh:
        fh.write(file.file.read())
    return {'filename': file.filename, 'stored_at': str(destination)}
