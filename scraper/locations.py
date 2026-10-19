"""Require an explicit India remote location; never infer it from 'Remote'."""
import re

REMOTE_INDIA = 'Remote (India)'
TARGET_LOCATIONS = {'Bengaluru', 'Hyderabad', REMOTE_INDIA}
_REMOTE_INDIA = re.compile(r'\b(?:remote[\s,()/–—:-]*india|india[\s,()/–—:-]*remote)\b', re.I)


def explicit_remote_india(location):
    return bool(_REMOTE_INDIA.search(str(location)))
