import asyncio
import sys
import logging
from app.services.problem_service import ProblemService
from app.services.llm_service import LLMService
from app.analysis.static_analyzer import analyze_code
from app.analysis.review_workflow import dedupe_and_sort_issues

logging.basicConfig(level=logging.INFO)

async def main():
    print("=== Testing Environment-Aware Error Detection in Problem Link Mode ===")

    # 1. Valid LeetCode solution (Java) using ListNode without driver code or imports
    valid_leetcode_java = """class Solution {
    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
        ListNode dummyHead = new ListNode(0);
        ListNode p = l1, q = l2, curr = dummyHead;
        int carry = 0;
        while (p != null || q != null) {
            int x = (p != null) ? p.val : 0;
            int y = (q != null) ? q.val : 0;
            int sum = carry + x + y;
            carry = sum / 10;
            curr.next = new ListNode(sum % 10);
            curr = curr.next;
            if (p != null) p = p.next;
            if (q != null) q = q.next;
        }
        if (carry > 0) {
            curr.next = new ListNode(carry);
        }
        return dummyHead.next;
    }
}
"""

    # Fetch LeetCode problem info
    lc_url = "https://leetcode.com/problems/add-two-numbers"
    problem_info, err = await ProblemService.fetch_problem_details(lc_url)
    print(f"LeetCode Problem Info: Title={problem_info.get('title') if problem_info else None}, Error={err}")

    # Mode 1: URL Provided - Valid Code
    print("\n--- Testing Problem Link Mode: Valid Solution ---")
    static_mode1 = analyze_code(valid_leetcode_java, "java", problem_info=problem_info)
    issues_mode1 = static_mode1.get("issues", [])
    print(f"Problem Link Mode Static Issues Count: {len(issues_mode1)}")
    for issue in issues_mode1:
        print("  - Issue:", issue.get("type"), issue.get("message"))

    # Assert no platform boilerplate errors or manufactured warnings
    assert len(issues_mode1) == 0 or not any(
        kw in str(i.get("message")).lower() for i in issues_mode1 for kw in ["listnode", "main", "import", "driver", "initialization"]
    ), "Problem Link Mode should NOT manufacture platform environment errors!"

    # 2. Valid Python Solution without main() or driver
    valid_python = """class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        seen = {}
        for i, num in enumerate(nums):
            diff = target - num
            if diff in seen:
                return [seen[diff], i]
            seen[num] = i
        return []
"""
    print("\n--- Testing Problem Link Mode: Valid Python Solution ---")
    static_py = analyze_code(valid_python, "python", problem_info=problem_info)
    issues_py = static_py.get("issues", [])
    print(f"Python Problem Link Issues Count: {len(issues_py)}")
    for issue in issues_py:
        print("  - Issue:", issue.get("type"), issue.get("message"))
    assert len(issues_py) == 0, "Valid Python solution in Problem Link Mode should produce 0 errors!"

    # 3. Test LeetCode 3Sum Java snippet with List, ArrayList, Arrays without imports
    three_sum_java = """class Solution {
    public List<List<Integer>> threeSum(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> res = new ArrayList<>();
        int n = nums.length;
        for (int i = 0; i < n - 2; i++) {
            if (i > 0 && nums[i] == nums[i - 1]) continue;
            int j = i + 1, k = n - 1;
            while (j < k) {
                int sum = nums[i] + nums[j] + nums[k];
                if (sum == 0) {
                    res.add(Arrays.asList(nums[i], nums[j], nums[k]));
                    while (j < k && nums[j] == nums[j + 1]) j++;
                    while (j < k && nums[k] == nums[k - 1]) k--;
                    j++;
                    k--;
                } else if (sum < 0) {
                    j++;
                } else {
                    k--;
                }
            }
        }
        return res;
    }
}
"""
    threesum_url = "https://leetcode.com/problems/3sum/"
    threesum_info, _ = await ProblemService.fetch_problem_details(threesum_url)
    print("\n--- Testing Problem Link Mode: LeetCode 3Sum Valid Snippet ---")
    static_threesum = analyze_code(three_sum_java, "java", problem_info=threesum_info)
    issues_threesum = static_threesum.get("issues", [])
    print(f"3Sum Problem Link Issues Count: {len(issues_threesum)}")
    for issue in issues_threesum:
        print("  - Issue:", issue.get("type"), issue.get("message"))

    assert not any(kw in str(i.get("message")).lower() for i in issues_threesum for kw in ["missing import", "cannot find symbol: class list", "cannot find symbol: class arraylist"]), \
        "Problem Link Mode must NOT report missing import or cannot find symbol for valid ArrayList/List!"

    # 4. Test User Code Typo `new ArrayLis<>()` in Problem Link Mode
    typo_java = """class Solution {
    public List<List<Integer>> threeSum(int[] nums) {
        Arrays.sort(nums);
        List<List<Integer>> res = new ArrayLis<>();
        return res;
    }
}
"""
    print("\n--- Testing Problem Link Mode: User Code Typo 'ArrayLis' ---")
    static_typo = analyze_code(typo_java, "java", problem_info=threesum_info)
    issues_typo = static_typo.get("issues", [])
    print(f"Typo Code Issues Count: {len(issues_typo)}")
    for issue in issues_typo:
        print("  - Detected Typo/Error:", issue.get("type"), "--> Message:", issue.get("message"))

    assert len(issues_typo) > 0 and any("cannot find symbol" in str(i.get("message")).lower() or "arraylis" in str(i.get("message")).lower() for i in issues_typo), \
        "Problem Link Mode MUST detect and report misspelled 'ArrayLis'!"

    # Mode 2: No URL Provided (Standalone mode)
    print("\n--- Testing No URL Mode: Standalone Code ---")
    static_mode2 = analyze_code(valid_leetcode_java, "java", problem_info=None)
    issues_mode2 = static_mode2.get("issues", [])
    print(f"No URL Mode Static Issues Count: {len(issues_mode2)}")
    assert len(issues_mode2) > 0, "No URL Mode should report missing declarations for standalone code!"

    # Test Actual Syntax Error in Problem Link Mode
    code_with_syntax_error = """class Solution {
    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
        ListNode dummyHead = new ListNode(0)
        return dummyHead.next;
    }
}
"""
    print("\n--- Testing Problem Link Mode: Code with Actual Syntax Error ---")
    static_err_mode1 = analyze_code(code_with_syntax_error, "java", problem_info=problem_info)
    issues_err = static_err_mode1.get("issues", [])
    print(f"Problem Link Mode Syntax Error Count: {len(issues_err)}")
    for issue in issues_err:
        print(f"  - Actual Error: Line {issue.get('line')}: {issue.get('message')}")
    assert any(int(i.get("line", 0)) == 3 for i in issues_err), "Genuine syntax error on line 3 must be detected!"

    print("\nAll Problem Link Analysis Rule & Typo Detection Tests Passed Successfully!")

if __name__ == "__main__":
    asyncio.run(main())
