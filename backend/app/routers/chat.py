from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.services.llm_service import LLMService

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


# Helper dependency to inject LLMService
def get_llm_service() -> LLMService:
    return LLMService()


from app.models.user import User
from app.services.auth_service import get_current_user


@router.post('/', response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    service: LLMService = Depends(get_llm_service),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    reply = await service.chat(payload.message)
    return ChatResponse(reply=reply)

