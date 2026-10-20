"""Require an explicit India remote location; never infer it from 'Remote'."""
import re
import json
from pathlib import Path

REMOTE_INDIA = 'Remote (India)'
POLICY=json.loads((Path(__file__).parents[1]/'config/location-policy.json').read_text())
TARGET_LOCATIONS=set(POLICY['discovery_locations'])
SHORTLIST_LOCATIONS=set(POLICY['shortlist_cities'])
OTHER_INDIA='Other India'
INDIA_CITIES=re.compile(r'\b(?:bengaluru|bangalore|hyderabad|chennai|madras|pune|poona|mumbai|bombay|delhi|noida|gurugram|gurgaon|kolkata|calcutta|ahmedabad|jaipur|kochi|cochin|thiruvananthapuram|trivandrum|coimbatore|indore|bhubaneswar|chandigarh|mohali|nagpur|mysuru|mysore|mangalore|mangaluru|vadodara|surat|lucknow|visakhapatnam|vijayawada)\b',re.I)


def india_discovery_location(value):
    text=str(value)
    explicit=bool(re.search(r'\bindia\b|(?:,|·)\s*IND\b',text,re.I))
    if (not explicit
            and re.search(r'\b(?:pakistan|bangladesh|united states|usa|united kingdom|canada|australia|singapore)\b',text,re.I)):
        return False
    return bool(explicit or INDIA_CITIES.search(text))
_REMOTE_INDIA = re.compile(r'\b(?:remote[\s,()/–—:-]*india|india[\s,()/–—:-]*remote)\b', re.I)


def explicit_remote_india(location):
    return bool(_REMOTE_INDIA.search(str(location)))
