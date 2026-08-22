import asyncio
import sys
import logging
from app.services.problem_service import ProblemService
from app.services.llm_service import LLMService
from app.analysis.static_analyzer import analyze_code
from app.analysis.review_workflow import dedupe_and_sort_issues

logging.basicConfig(level=logging.INFO)

async def main():
    print("=== Testing Two Analysis Modes ===")

    # Sample LeetCode solution for Add Two Numbers using ListNode
    valid_leetcode_code = """class Solution {
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

    # Mode 1: URL Provided
    print("\n--- Testing Mode 1: URL Provided ---")
    static_mode1 = analyze_code(valid_leetcode_code, "java", problem_info=problem_info)
    issues_mode1 = static_mode1.get("issues", [])
    print(f"Mode 1 Static Issues Count: {len(issues_mode1)}")
    for issue in issues_mode1:
        print("  - Issue:", issue.get("type"), issue.get("message"))
    # Verify no ListNode or main errors reported in Mode 1
    assert not any("ListNode" in str(i.get("message")) or "main" in str(i.get("message")) for i in issues_mode1), \
        "Mode 1 should NOT report platform type ListNode or missing main as error!"

    # Mode 2: No URL Provided
    print("\n--- Testing Mode 2: No URL Provided ---")
    static_mode2 = analyze_code(valid_leetcode_code, "java", problem_info=None)
    issues_mode2 = static_mode2.get("issues", [])
    print(f"Mode 2 Static Issues Count: {len(issues_mode2)}")
    for issue in issues_mode2:
        print("  - Issue:", issue.get("type"), issue.get("message"))
    # Verify standalone compiler flags missing declaration for standalone code mode
    assert len(issues_mode2) > 0, "Mode 2 should report missing declarations for standalone code!"

    # Test Actual Error on Line 3 in Mode 1
    code_with_syntax_error = """class Solution {
    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
        ListNode dummyHead = new ListNode(0)
        return dummyHead.next;
    }
}
"""
    static_err_mode1 = analyze_code(code_with_syntax_error, "java", problem_info=problem_info)
    issues_err = static_err_mode1.get("issues", [])
    print(f"\nMode 1 Code with Actual Syntax Error Issues Count: {len(issues_err)}")
    for issue in issues_err:
        print(f"  - Actual Error: Line {issue.get('line')}: {issue.get('message')}")
    assert any(int(i.get("line", 0)) == 3 for i in issues_err), "Actual error on line 3 must be detected!"

    print("\nAll Mode Tests Passed Successfully!")

if __name__ == "__main__":
    asyncio.run(main())
