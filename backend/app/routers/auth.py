from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.schemas.user import Token, UserCreate, UserOut
from app.services.auth_service import authenticate_user, create_access_token, create_user, get_db

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post('/register', response_model=UserOut)
def register(user_in: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    try:
        user = create_user(db, user_in)
        return user
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post('/login', response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = authenticate_user(db, payload.email, payload.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Incorrect email or password')
    token = create_access_token(subject=user.email)
    return Token(access_token=token)


from app.models.user import User
from app.services.auth_service import get_current_user


@router.get('/me', response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return current_user

