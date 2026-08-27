import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.analysis.static_analyzer import analyze_code
from app.analysis.review_workflow import dedupe_and_sort_issues, normalize_issue

def test_valid_leetcode_java():
    code = """class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            if (map.containsKey(target - nums[i])) {
                return new int[]{map.get(target - nums[i]), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{};
    }
}"""
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum",
        "slug": "two-sum",
        "difficulty": "Easy",
        "url": "https://leetcode.com/problems/two-sum"
    }

    res = analyze_code(code, "java", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 1 - Valid LeetCode Java Code:")
    print("Issues count:", len(issues))
    assert len(issues) == 0, f"Expected 0 issues for valid LeetCode Java code, got: {issues}"
    print("PASSED!\n")

def test_leetcode_java_typo():
    code = """class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> map = new HashMp<>();
        for (int i = 0; i < nums.length; i++) {
            if (map.containsKey(target - nums[i])) {
                return new int[]{map.get(target - nums[i]), i};
            }
            map.put(nums[i], i);
        }
        return new int[]{};
    }
}"""
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum",
        "slug": "two-sum"
    }

    res = analyze_code(code, "java", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 2 - LeetCode Java Code with HashMp typo on Line 3:")
    print("Issues count:", len(issues))
    for iss in issues:
        print("Issue:", iss)
    assert len(issues) >= 1, "Expected at least 1 issue for HashMp typo"
    assert issues[0]["line"] == 3, f"Expected error mapped to Line 3, got Line {issues[0]['line']}"
    print("PASSED!\n")

def test_valid_leetcode_python():
    code = """class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            comp = target - num
            if comp in seen:
                return [seen[comp], i]
            seen[num] = i
        return []"""
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum"
    }

    res = analyze_code(code, "python", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 3 - Valid LeetCode Python Code:")
    print("Issues count:", len(issues))
    assert len(issues) == 0, f"Expected 0 issues for valid LeetCode Python code, got: {issues}"
    print("PASSED!\n")

def test_leetcode_python_missing_colon():
    code = """class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, num in enumerate(nums):
            comp = target - num
            if comp in seen
                return [seen[comp], i]
            seen[num] = i
        return []"""
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum"
    }

    res = analyze_code(code, "python", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 4 - LeetCode Python Code with missing colon on Line 6:")
    print("Issues count:", len(issues))
    for iss in issues:
        print("Issue:", iss)
    assert len(issues) >= 1, "Expected at least 1 issue for missing colon"
    assert issues[0]["line"] == 6, f"Expected error mapped to Line 6, got Line {issues[0]['line']}"
    print("PASSED!\n")

def test_valid_leetcode_cpp():
    code = """#include <vector>
#include <unordered_map>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            int comp = target - nums[i];
            if (seen.count(comp)) {
                return {seen[comp], i};
            }
            seen[nums[i]] = i;
        }
        return {};
    }
};"""
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum"
    }

    res = analyze_code(code, "cpp", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 5 - Valid LeetCode C++ Code:")
    print("Issues count:", len(issues))
    assert len(issues) == 0, f"Expected 0 issues for valid LeetCode C++ code, got: {issues}"
    print("PASSED!\n")

def test_user_exact_example_narraylist_mapeed():
    code = "class Solution {\n" \
           "    public int[] twoSum(int[] nums, int target) {\n" \
           "\n" \
           "        List<Integer> list = new narrayList<>();\n" \
           "        Map<Integer, Integer> map = new HashMap<>();\n" \
           "        for (int i = 0; i < nums.length; i++) {\n" \
           "            if (mapeed.containsKey(target - nums[i])) {\n" \
           "                return new int[]{map.get(target - nums[i]), i};\n" \
           "            }\n" \
           "        }\n" \
           "        return new int[]{};\n" \
           "    }\n" \
           "}"
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum"
    }

    res = analyze_code(code, "java", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 6 - User's Exact Example (narrayList on Line 4, mapeed on Line 7):")
    print("Issues count:", len(issues))
    for iss in issues:
        print("Issue:", iss)

    issue_lines = {iss["line"] for iss in issues}
    assert 4 in issue_lines, f"Expected error on Line 4 (narrayList), got lines: {issue_lines}"
    assert 7 in issue_lines, f"Expected error on Line 7 (mapeed), got lines: {issue_lines}"
    assert 1 not in issue_lines, f"Line 1 (class Solution) must NOT be reported as error location! Got lines: {issue_lines}"
    print("PASSED!\n")

def test_python_multiple_independent_errors():
    code = "class Solution:\n" \
           "    def twoSum(self, nums: List[int], target: int) -> List[int]:\n" \
           "        seen = {}\n" \
           "        for i, num in enumerate(numss):\n" \
           "            comp = target - num\n" \
           "            if comp in seenn:\n" \
           "                return [seen[comp], i]\n" \
           "        return []"
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum"
    }

    res = analyze_code(code, "python", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    print("Test 7 - Multiple Independent Python Errors (numss on Line 4, seenn on Line 6):")
    print("Issues count:", len(issues))
    for iss in issues:
        print("Issue:", iss)

    issue_lines = {iss["line"] for iss in issues}
    assert 4 in issue_lines, f"Expected error on Line 4 (numss), got lines: {issue_lines}"
    assert 6 in issue_lines, f"Expected error on Line 6 (seenn), got lines: {issue_lines}"
    print("PASSED!\n")

def test_strict_error_schema_validation():
    code = "class Solution {\n" \
           "    public int[] twoSum(int[] nums, int target) {\n" \
           "\n" \
           "        List<Integer> list = new narrayList<>();\n" \
           "        Map<Integer, Integer> map = new HashMap<>();\n" \
           "        for (int i = 0; i < nums.length; i++) {\n" \
           "            if (mapeed.containsKey(target - nums[i])) {\n" \
           "                return new int[]{map.get(target - nums[i]), i};\n" \
           "            }\n" \
           "        }\n" \
           "        return new int[]{};\n" \
           "    }\n" \
           "}"
    problem_info = {
        "platform": "LeetCode",
        "title": "Two Sum"
    }

    res = analyze_code(code, "java", problem_info=problem_info)
    issues = dedupe_and_sort_issues([normalize_issue(i) for i in res["issues"]], source_code=code, has_problem_url=True)

    required_keys = {"type", "severity", "message", "line", "why_it_matters", "suggested_fix", "is_error", "level"}

    print("Test 8 - Strict Schema Keys Validation:")
    for idx, iss in enumerate(issues):
        missing = required_keys - set(iss.keys())
        assert not missing, f"Issue {idx} missing required keys: {missing}"
        assert isinstance(iss["line"], int) and iss["line"] > 0, f"Line must be positive int, got {iss['line']}"
        assert isinstance(iss["is_error"], bool), f"is_error must be bool"
        assert iss["level"] == "Level 1", f"level must be Level 1"
        print(f"Issue {idx + 1} strictly validated with keys: {sorted(iss.keys())}")
    print("PASSED!\n")

if __name__ == "__main__":
    test_valid_leetcode_java()
    test_leetcode_java_typo()
    test_valid_leetcode_python()
    test_leetcode_python_missing_colon()
    test_valid_leetcode_cpp()
    test_user_exact_example_narraylist_mapeed()
    test_python_multiple_independent_errors()
    test_strict_error_schema_validation()
    print("ALL TESTS PASSED SUCCESSFULLY!")
