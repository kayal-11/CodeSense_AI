from fastapi import APIRouter, Depends
from app.models.user import User
from app.services.auth_service import get_current_user

router = APIRouter()


@router.get('/')
def get_reports(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    return {
        'overall_score': 91,
        'security_score': 88,
        'maintainability_score': 85,
        'performance_score': 90,
        'readability_score': 93,
        'complexity_score': 82,
        'bug_count': 3,
        'issue_severity': 'medium',
        'recommendations': ['Parameterize database queries', 'Add unit tests', 'Improve naming consistency'],
    }
