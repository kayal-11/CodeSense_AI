from datetime import datetime, timedelta, timezone
import json
from typing import Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.models.review import Review
from app.models.user import User
from app.services.auth_service import get_current_user
from database.session import get_db

router = APIRouter()


def _calculate_streaks(dates: list[datetime]) -> tuple[int, int, bool]:
    if not dates:
        return 0, 0, False

    unique_days = sorted({d.astimezone().date() for d in dates if d is not None})
    if not unique_days:
        return 0, 0, False

    today = datetime.now().date()
    today_completed = today in unique_days

    best_streak = 1
    current_run = 1

    for i in range(1, len(unique_days)):
        if unique_days[i] == unique_days[i - 1] + timedelta(days=1):
            current_run += 1
            best_streak = max(best_streak, current_run)
        else:
            current_run = 1

    last_day = unique_days[-1]
    if last_day == today or last_day == today - timedelta(days=1):
        current_streak = current_run
    else:
        current_streak = 0

    return current_streak, max(best_streak, current_streak), today_completed


def _to_date(dt: Any) -> Any:
    if dt is None:
        return None
    try:
        return dt.astimezone().date()
    except Exception:
        try:
            return dt.date()
        except Exception:
            return None


@router.get('/dashboard')
@router.get('/')
def get_dashboard_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    query = db.query(Review)
    if current_user:
        query = query.filter(Review.user_id == current_user.id)
    reviews = query.order_by(Review.created_at.asc()).all()

    today_dt = datetime.now()
    today_date = today_dt.date()
    monday_date = today_date - timedelta(days=today_dt.weekday())

    def _make_day_data(idx: int, day_name: str) -> tuple[dict[str, Any], dict[str, Any]]:
        target_date = monday_date + timedelta(days=idx)
        date_str = f"{target_date.day} {target_date.strftime('%b')}"
        is_today = (target_date == today_date)
        is_future = (target_date > today_date)

        if is_future:
            cnt = 0
            day_avg = 0
            lvl = 'Level 1: Brute Force'
        else:
            day_reviews = [r for r in reviews if r.created_at and _to_date(r.created_at) == target_date]
            cnt = len(day_reviews)
            scores = [r.score for r in day_reviews]
            day_avg = round(sum(scores) / len(scores)) if scores else (avg_accuracy if 'avg_accuracy' in locals() and cnt > 0 else 0)
            if day_avg > 90:
                lvl = 'Level 3: Optimized Solution'
            elif day_avg >= 80:
                lvl = 'Level 2: Better Approach'
            else:
                lvl = 'Level 1: Brute Force'

        weekly_item = {
            'name': day_name,
            'solved': cnt,
            'date': date_str,
            'is_today': is_today,
            'is_future': is_future,
        }
        trend_item = {
            'name': day_name,
            'score': day_avg,
            'level': lvl,
            'solved': cnt,
            'date': date_str,
            'is_today': is_today,
            'is_future': is_future,
        }
        return weekly_item, trend_item

    avg_accuracy = round(sum(r.score for r in reviews) / len(reviews)) if reviews else 0
    weekly_activity = []
    progress_trend = []
    for i, dname in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']):
        w_item, t_item = _make_day_data(i, dname)
        weekly_activity.append(w_item)
        progress_trend.append(t_item)

    if not reviews:
        return {
            'problems_solved': 0,
            'problems_needing_improvement': 0,
            'dsa_accuracy': 0,
            'current_streak': 0,
            'best_streak': 0,
            'today_completed': False,
            'difficulty': {'easy': 0, 'medium': 0, 'hard': 0},
            'level_progression': {'level_1': 0, 'level_2': 0, 'level_3': 0},
            'progress_trend': progress_trend,
            'weekly_activity': weekly_activity,
            'topic_mastery': [
                {'name': 'Arrays & Strings', 'mastery': 0, 'solved': 0, 'color': 'bg-cyan-400'},
                {'name': 'Stack, Queue & Linked List', 'mastery': 0, 'solved': 0, 'color': 'bg-emerald-400'},
                {'name': 'Trees & Graphs', 'mastery': 0, 'solved': 0, 'color': 'bg-violet-400'},
                {'name': 'Dynamic Programming', 'mastery': 0, 'solved': 0, 'color': 'bg-amber-400'},
            ],
            'weak_topics': [],
            'recommendations': [
                'Submit source code in C, C++, Java, or Python in the Review workspace to start tracking your real-time DSA progress.'
            ],
            'languages_supported': ['c', 'cpp', 'java', 'python'],
        }

    total_solved = len(reviews)
    needing_improvement = sum(1 for r in reviews if r.score < 85 or r.findings_count > 0)

    dates = [r.created_at for r in reviews if r.created_at is not None]
    current_streak, best_streak, today_completed = _calculate_streaks(dates)

    # Difficulty breakdown based on score/findings
    easy_cnt = sum(1 for r in reviews if r.score >= 85)
    med_cnt = sum(1 for r in reviews if 70 <= r.score < 85)
    hard_cnt = sum(1 for r in reviews if r.score < 70)

    # 3-Level Progression
    lvl1_cnt = sum(1 for r in reviews if r.score < 80)
    lvl2_cnt = sum(1 for r in reviews if 80 <= r.score <= 90)
    lvl3_cnt = sum(1 for r in reviews if r.score > 90)

    # Categorize into DSA topics
    topic_data: dict[str, list[int]] = {
        'Arrays & Strings': [],
        'Stack, Queue & Linked List': [],
        'Trees & Graphs': [],
        'Dynamic Programming': [],
    }

    for r in reviews:
        code_txt = (r.code or '').lower()
        fn_txt = (r.filename or '').lower()
        summary_txt = (r.summary or '').lower()
        combined = f"{code_txt} {fn_txt} {summary_txt}"

        if 'dp' in combined or 'memo' in combined or 'knapsack' in combined or 'dynamic' in combined:
            topic_data['Dynamic Programming'].append(r.score)
        elif 'tree' in combined or 'graph' in combined or 'bfs' in combined or 'dfs' in combined or 'node' in combined:
            topic_data['Trees & Graphs'].append(r.score)
        elif 'stack' in combined or 'queue' in combined or 'list' in combined or 'head' in combined:
            topic_data['Stack, Queue & Linked List'].append(r.score)
        else:
            topic_data['Arrays & Strings'].append(r.score)

    colors = {
        'Arrays & Strings': 'bg-cyan-400',
        'Stack, Queue & Linked List': 'bg-emerald-400',
        'Trees & Graphs': 'bg-violet-400',
        'Dynamic Programming': 'bg-amber-400',
    }

    topic_mastery = []
    lowest_topic = None
    lowest_mastery = 101

    for tname, tscores in topic_data.items():
        tsolved = len(tscores)
        tmastery = round(sum(tscores) / tsolved) if tsolved > 0 else (75 if tname == 'Arrays & Strings' else 60)
        topic_mastery.append({
            'name': tname,
            'mastery': tmastery,
            'solved': tsolved,
            'color': colors[tname],
        })
        if tmastery < lowest_mastery:
            lowest_mastery = tmastery
            lowest_topic = tname

    recommendations = []
    if lowest_topic:
        recommendations.append(
            f"Focus Area ({lowest_topic}): Practice optimizing Time & Space complexity from Level 1 → Level 2 → Level 3."
        )

    if lvl1_cnt > 0:
        recommendations.append(
            f"Level 1 → Level 2 Progression: Refactor {lvl1_cnt} brute-force problem(s) using Hash Maps, Two-Pointers, or Binary Search."
        )
    if lvl2_cnt > 0:
        recommendations.append(
            f"Level 2 → Level 3 Progression: Advance {lvl2_cnt} solution(s) to optimal O(1) auxiliary space complexity in C++, Java, Python, or C."
        )
    if not recommendations:
        recommendations.append("Master Graph Traversal (BFS & DFS) and Dynamic Programming space optimization.")

    return {
        'problems_solved': total_solved,
        'problems_needing_improvement': needing_improvement,
        'dsa_accuracy': avg_accuracy,
        'current_streak': current_streak,
        'best_streak': best_streak,
        'today_completed': today_completed,
        'difficulty': {'easy': easy_cnt, 'medium': med_cnt, 'hard': hard_cnt},
        'level_progression': {'level_1': lvl1_cnt, 'level_2': lvl2_cnt, 'level_3': lvl3_cnt},
        'progress_trend': progress_trend,
        'weekly_activity': progress_trend,
        'topic_mastery': topic_mastery,
        'weak_topics': [lowest_topic] if lowest_topic else [],
        'recommendations': recommendations,
        'languages_supported': ['c', 'cpp', 'java', 'python'],
    }
