from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from database.session import init_db, verify_connection
from app.routers import auth, chat, reports, reviews, upload

app = FastAPI(title='CodeSense AI', version='1.0.0', description='AI-powered intelligent code review and security assistant')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(auth.router, prefix='/auth', tags=['auth'])
app.include_router(upload.router, prefix='/upload', tags=['upload'])
app.include_router(reviews.router, prefix='/review', tags=['review'])
app.include_router(chat.router, prefix='/chat', tags=['chat'])
app.include_router(reports.router, prefix='/reports', tags=['reports'])


@app.on_event('startup')
def on_startup() -> None:
    verify_connection()
    init_db()


@app.get('/health')
def health_check() -> dict[str, str]:
    return {'status': 'ok'}


@app.get('/health/db')
def health_check_db() -> dict[str, str]:
    try:
        verify_connection()
        return {'status': 'ok'}
    except Exception as exc:
        raise HTTPException(status_code=503, detail='Database unavailable') from exc
