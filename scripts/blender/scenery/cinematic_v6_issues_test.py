#!/usr/bin/env python3
from cinematic_v6_issues import ISSUE_KEYS, assert_all_root_cause, decisions


def test_all_recurring_issues_require_root_cause():
    assert len(ISSUE_KEYS) == 7
    result = decisions()
    for key in ISSUE_KEYS:
        assert result[key]["decision"] == "ROOT_CAUSE_AUDIT_REQUIRED"
        assert result[key]["incrementalRepairAllowed"] is False
    assert_all_root_cause()


if __name__ == "__main__":
    test_all_recurring_issues_require_root_cause()
    print("cinematic_v6_issues_test PASS")
