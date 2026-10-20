import re
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone
from .models import Job
from .requirements import candidate_text
from .experience import analyze_experience
from .posting import posting_current
from .source_ownership import correct_board_owner
from .roles import classify_role, NON_TECHNICAL
from .locations import TARGET_LOCATIONS, SHORTLIST_LOCATIONS, REMOTE_INDIA, OTHER_INDIA, explicit_remote_india, india_discovery_location

INTERNSHIP_ROLE_PATTERNS = {
    "DevOps": r"\bdev\s*ops\b|\bdev\s*sec\s*ops\b|\brelease\b|\bdeployment\b",
    "Cloud": r"\bcloud\b",
    "SRE": r"\bsite reliability\b|\bsre\b",
    "Platform": r"\bplatform\b",
    "Infrastructure / Operations": r"\binfrastructure\b|\blinux\b|\b(?:it|cloud|platform|systems?|network|production) operations\b|\boperations (?:engineering|engineer|infrastructure)\b",
    "Java / Backend": r"\bjava\b|\bback[ -]?end\b|\bspring\b",
    "Software Engineering": r"\bsoftware\b|\bdeveloper\b|\bengineering\b|\bsde\b|\btechnology\b|\btechnical\b",
}
SKILL_RULES=json.loads((Path(__file__).parents[1]/'config/skills.json').read_text())
SKILLS=list(SKILL_RULES)
MAX_JOB_AGE_HOURS = 24
MAX_EXPERIENCE_YEARS = 3
TARGET_CITIES = TARGET_LOCATIONS
INDIA_TZ = timezone(timedelta(hours=5, minutes=30))
LEADERSHIP_TITLE = re.compile(r"\b(?:architect|director|head|lead|manager|principal|staff|vice president|vp)\b", re.I)

def normalize_location(value: str):
    low=value.lower(); hybrid=" · Hybrid" if "hybrid" in low else ""
    if not india_discovery_location(value): return value.strip() or "Not specified",None
    if re.search(r"\bbangalore\b|\bbengaluru\b",low): return "Bengaluru"+hybrid,"Bengaluru"
    if re.search(r"\bhyderabad\b",low): return "Hyderabad"+hybrid,"Hyderabad"
    if explicit_remote_india(value): return REMOTE_INDIA,REMOTE_INDIA
    if india_discovery_location(value): return value.strip(),OTHER_INDIA
    return value.strip() or "Not specified",None

def classify_title(title: str, description: str=""):
    clean, category = classify_role(title, description)
    if category != "Other" or NON_TECHNICAL.search(clean):
        return clean, category
    if re.search(r"\b(?:intern|internship|co op|apprentice|apprenticeship)\b", clean):
        for category, pattern in INTERNSHIP_ROLE_PATTERNS.items():
            if re.search(pattern, clean, re.I):
                return clean, category
    return clean, "Other"

def classify_employment_type(title: str, description: str=""):
    """Keep internships out of full-time views without guessing from generic graduate wording."""
    corpus=f"{title}\n{description}"
    if re.search(r"\b(?:intern|internship|co[ -]?op|apprentice|apprenticeship)\b",title,re.I): return "Internship"
    if re.search(r"\b(?:this is an?|join us as an?|seeking an?|hiring an?)\s+(?:[a-z]+\s+){0,3}(?:intern|internship|apprentice)\b",corpus,re.I): return "Internship"
    return "Full-time"

def extract_experience(text: str):
    analysis = analyze_experience(text)
    return analysis['min'], analysis['max'], analysis['label']

def skill_present(skill: str, corpus: str):
    return bool(re.search(SKILL_RULES.get(skill,rf"(?<![a-z0-9]){re.escape(skill.lower())}(?![a-z0-9])"),corpus,re.I))

def posted_age_hours(posted_at):
    if not posted_at:
        return None
    try:
        posted=datetime.fromisoformat(posted_at.replace("Z","+00:00"))
        if posted.tzinfo is None:
            posted=posted.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc)-posted.astimezone(timezone.utc)).total_seconds()/3600
    except (TypeError,ValueError):
        return None

def enrich(job: Job, company_priority: int=3):
    correct_board_owner(job)
    job.normalized_title,job.role_category=classify_title(job.title,job.description); job.normalized_location,job.city=normalize_location(job.location)
    job.employment_type=classify_employment_type(job.title,job.description)
    job.experience_min,job.experience_max,job.experience_label=extract_experience(job.description)
    corpus=f"{job.title} {candidate_text(job.description)}".lower(); job.skills=[s for s in SKILLS if skill_present(s,corpus)]
    age=posted_age_hours(job.posted_at)
    reported=job.reported_age_hours
    employer_says_today=bool(job.posted_label and re.search(r"\b(?:posted\s+)?today\b",job.posted_label,re.I))
    recent=posting_current(job)
    bounded_experience=job.experience_min is not None and job.experience_max is not None and job.experience_min >= 0 and job.experience_max <= MAX_EXPERIENCE_YEARS
    accepted_plus=job.experience_min is not None and job.experience_max is None and 0 <= job.experience_min <= 2
    experience_ok=bounded_experience or accepted_plus
    leadership_title=re.sub(r"\bmember of technical staff\b", "technical contributor", job.title, flags=re.I)
    leadership=bool(LEADERSHIP_TITLE.search(leadership_title))
    explicit_entry_title=bool(re.search(r"\b(?:associate|junior|graduate|trainee|fresher)\b|\b(?:sde|swe|software engineer|qa engineer|sdet|support engineer)\s*(?:i|1)\b",job.title,re.I))
    if job.experience_min is None and explicit_entry_title and job.experience_label=="Unknown":
        job.experience_label="Entry-level title — experience unverified"
        experience_ok=False
    if job.city not in SHORTLIST_LOCATIONS: reason="Outside shortlist cities — Bengaluru and Hyderabad only"
    elif leadership: reason="Leadership-level title"
    elif job.role_category=="Other": reason="Role outside target list"
    elif job.employment_type=="Internship" and not recent: reason="Posting date not verified within 24 hours"
    elif job.employment_type=="Internship": reason="Eligible"
    elif job.experience_label in ("Conditional experience — verify", "Conflicting experience — verify"): reason=job.experience_label
    elif job.experience_min is None and job.experience_max is None: reason="Entry-level title — experience unverified" if explicit_entry_title else "Experience not stated — verify"
    elif not experience_ok: reason="Experience exceeds 0–3 YOE policy"
    elif not recent: reason="Posting date not verified within 24 hours"
    else: reason="Eligible"
    job.is_eligible=reason=="Eligible"; job.eligibility_reason=reason
    effective_age=age if age is not None else reported
    job.freshness_score=12 if employer_says_today else 0 if effective_age is None or effective_age > MAX_JOB_AGE_HOURS else 35 if effective_age<1 else 30 if effective_age<3 else 25 if effective_age<6 else 18 if effective_age<12 else 12
    exp=25 if experience_ok else 0
    title=20 if job.role_category!="Other" else 0; skill=min(10,len(job.skills)*2); priority=min(5,max(1,company_priority))
    signal=re.search(r"actively hiring|immediate join(?:er|ing)?|urgent hiring|multiple (?:openings|positions)|early applicant",corpus,re.I); hiring=5 if signal else 0
    job.hiring_signal=signal.group(0).title() if signal else None; job.relevance_score=min(100,job.freshness_score+exp+title+skill+priority+hiring); job.priority_score=priority
    return job
