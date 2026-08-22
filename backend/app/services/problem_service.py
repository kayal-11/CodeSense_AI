import html
import logging
import re
from typing import Any
import httpx

logger = logging.getLogger(__name__)


def parse_problem_url(url: str) -> dict[str, str] | None:
    clean_url = url.strip()
    if not clean_url:
        return None

    # Check LeetCode pattern
    lc_match = re.search(r'leetcode\.(com|cn)/problems/([^/?#]+)', clean_url, re.IGNORECASE)
    if lc_match:
        return {
            'platform': 'leetcode',
            'slug': lc_match.group(2).strip('/'),
            'domain': lc_match.group(1).lower(),
        }

    # Check GeeksforGeeks pattern
    gfg_match = re.search(r'geeksforgeeks\.org/(?:problems/)?([^/?#]+)', clean_url, re.IGNORECASE)
    if gfg_match:
        slug = gfg_match.group(1).strip('/')
        # Exclude standard non-problem paths if matched accidentally
        if slug in ('courses', 'practice', 'gfg-backend', 'category', 'tag'):
            return None
        return {
            'platform': 'geeksforgeeks',
            'slug': slug,
        }

    return None


def _clean_html(raw_html: str) -> str:
    if not raw_html:
        return ''
    # Replace line breaks and paragraphs with newlines
    text = re.sub(r'<(br|header|footer|div|p)\s*/?>', '\n', raw_html, flags=re.IGNORECASE)
    # Remove all HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Unescape HTML entities
    text = html.unescape(text)
    # Normalize multiple whitespace/newlines
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return '\n'.join(lines)


class ProblemService:
    @staticmethod
    async def fetch_problem_details(url: str) -> tuple[dict[str, Any] | None, str | None]:
        """
        Validates problem URL and fetches problem details (Title, Difficulty, Topics, Description, Constraints).
        Returns (problem_info_dict, error_message).
        """
        parsed = parse_problem_url(url)
        if not parsed:
            return None, "Invalid Problem URL. Only LeetCode (leetcode.com/problems/...) and GeeksforGeeks (geeksforgeeks.org/problems/...) URLs are supported."

        platform = parsed['platform']
        slug = parsed['slug']

        if platform == 'leetcode':
            return await ProblemService._fetch_leetcode_problem(slug, parsed.get('domain', 'com'))
        elif platform == 'geeksforgeeks':
            return await ProblemService._fetch_gfg_problem(slug)

        return None, "Unsupported problem platform."

    @staticmethod
    async def _fetch_leetcode_problem(slug: str, domain: str = 'com') -> tuple[dict[str, Any] | None, str | None]:
        endpoint = f"https://leetcode.{domain}/graphql"
        query = """
        query getQuestionDetail($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                questionId
                title
                titleSlug
                difficulty
                content
                topicTags {
                    name
                }
            }
        }
        """
        payload = {
            "query": query,
            "variables": {"titleSlug": slug}
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.post(endpoint, json=payload, headers=headers)
                if resp.status_code != 200:
                    logger.warning(f"LeetCode GraphQL returned HTTP {resp.status_code} for slug {slug}")
                    return None, f"Failed to retrieve LeetCode problem details (HTTP {resp.status_code}). Please verify the problem link."

                data = resp.json()
                question = data.get("data", {}).get("question")
                if not question:
                    return None, f"LeetCode problem '{slug}' was not found. Please check the URL."

                title = question.get("title") or slug.replace('-', ' ').title()
                difficulty = question.get("difficulty") or "Medium"
                tags = [tag.get("name") for tag in question.get("topicTags", []) if tag.get("name")]
                topic_str = ", ".join(tags) if tags else "General DSA"
                content_html = question.get("content", "")
                plain_desc = _clean_html(content_html)

                return {
                    "platform": "LeetCode",
                    "title": title,
                    "slug": slug,
                    "difficulty": difficulty,
                    "topic": topic_str,
                    "description": plain_desc[:2000] if plain_desc else "LeetCode Problem Description",
                    "url": f"https://leetcode.{domain}/problems/{slug}/",
                }, None

        except Exception as exc:
            logger.error(f"Error fetching LeetCode problem '{slug}': {exc}")
            return None, f"Network error fetching LeetCode problem details: {exc}"

    @staticmethod
    async def _fetch_gfg_problem(slug: str) -> tuple[dict[str, Any] | None, str | None]:
        # Try Practice API first
        api_url = f"https://practiceapi.geeksforgeeks.org/api/vr/problems/problem/{slug}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(api_url, headers=headers)
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        pdata = data.get("data", {})
                        if pdata:
                            title = pdata.get("problem_name") or pdata.get("title") or slug.replace('-', ' ').title()
                            difficulty = pdata.get("difficulty") or "Medium"
                            problem_desc = _clean_html(pdata.get("problem_question", "") or pdata.get("description", ""))
                            topics = pdata.get("tags", [])
                            if isinstance(topics, list):
                                topic_names = [t.get("name") if isinstance(t, dict) else str(t) for t in topics]
                                topic_str = ", ".join(topic_names)
                            else:
                                topic_str = "Data Structures & Algorithms"

                            return {
                                "platform": "GeeksforGeeks",
                                "title": title,
                                "slug": slug,
                                "difficulty": difficulty,
                                "topic": topic_str or "Data Structures & Algorithms",
                                "description": problem_desc[:2000] if problem_desc else "GeeksforGeeks Problem Description",
                                "url": f"https://www.geeksforgeeks.org/problems/{slug}/",
                            }, None
                    except Exception:
                        pass

                # Fallback to fetching webpage HTML if API didn't return json
                web_url = f"https://www.geeksforgeeks.org/problems/{slug}/1"
                resp_web = await client.get(web_url, headers=headers)
                if resp_web.status_code == 200:
                    html_content = resp_web.text
                    title_match = re.search(r'<title>(.*?)</title>', html_content, re.IGNORECASE)
                    raw_title = title_match.group(1) if title_match else slug.replace('-', ' ').title()
                    clean_title = raw_title.replace('- GeeksforGeeks', '').replace('| GeeksforGeeks', '').strip()

                    plain_desc = _clean_html(html_content[:5000])

                    return {
                        "platform": "GeeksforGeeks",
                        "title": clean_title,
                        "slug": slug,
                        "difficulty": "Medium",
                        "topic": "Data Structures & Algorithms",
                        "description": plain_desc[:2000] if plain_desc else "GeeksforGeeks Problem Description",
                        "url": web_url,
                    }, None

                return None, f"GeeksforGeeks problem '{slug}' could not be identified or found."

        except Exception as exc:
            logger.error(f"Error fetching GFG problem '{slug}': {exc}")
            return None, f"Network error fetching GeeksforGeeks problem details: {exc}"
