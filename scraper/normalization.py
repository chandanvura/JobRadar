import re
import json
from pathlib import Path
from datetime import datetime, timedelta, timezone
from .models import Job
from .requirements import candidate_text
from .source_ownership import correct_board_owner
from .roles import classify_role, NON_TECHNICAL

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
TARGET_CITIES = {"Bengaluru", "Hyderabad"}
INDIA_TZ = timezone(timedelta(hours=5, minutes=30))
LEADERSHIP_TITLE = re.compile(r"\b(?:architect|director|head|lead|manager|principal|staff|vice president|vp)\b", re.I)

def normalize_location(value: str):
    low=value.lower(); hybrid=" · Hybrid" if "hybrid" in low else ""
    if re.search(r"\bbangalore\b|\bbengaluru\b",low): return "Bengaluru"+hybrid,"Bengaluru"
    if re.search(r"\bhyderabad\b",low): return "Hyderabad"+hybrid,"Hyderabad"
    if re.search(r"\bchennai\b|\bmadras\b",low): return "Chennai"+hybrid,"Chennai"
    if re.search(r"\bpune\b|\bpoona\b",low): return "Pune"+hybrid,"Pune"
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
    text=re.sub(r"\b(zero|one|two|three|four|five)\s+(?=years?|yrs?|yoe)",lambda m:str({"zero":0,"one":1,"two":2,"three":3,"four":4,"five":5}[m.group(1).lower()])+" ",text,flags=re.I)
    junior=re.search(r"\b(freshers?|fresh graduates?|new graduates?|entry.?level|early career|campus hire|university graduate|recent graduates?|no (?:prior |professional |work )?experience required)\b",text,re.I)
    clauses=re.split(r"[\n.;•]+",text)
    relevant=[c for c in clauses if re.search(r"\b(years?|yrs?|yoe|experience|fresher|graduate)\b",c,re.I) and not re.search(r"\b(company|organisation|organization|founded|serving|combined|team has)\b.{0,35}\b(years?|experience)\b",c,re.I)]
    candidate_text=" ".join(relevant)
    ranges=[(float(a),float(b)) for a,b in re.findall(r"\b(\d+(?:\.\d+)?)\s*(?:years?\s*)?(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    month_ranges=[(float(a)/12,float(b)/12) for a,b in re.findall(r"\b(\d+)\s*(?:-|–|—|to)\s*(\d+)\s*months?\b",candidate_text,re.I)]
    mixed_ranges=[(float(a)/12,float(b)) for a,b in re.findall(r"\b(\d+)\s*months?\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*years?\b",candidate_text,re.I)]
    upper_bounds=[float(x) for x in re.findall(r"\b(?:up\s*to|less than|maximum(?: of)?|max\.?)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    lower_bounds=[float(x) for x in re.findall(r"\b(?:at least|minimum(?: of)?|more than|over)\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    lower_bounds += [float(x) for x in re.findall(r"\bminimum\s+(?:relevant\s+|professional\s+|work\s+)?experience(?:\s+of)?\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    lower_bounds += [float(x) for x in re.findall(r"\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\s*(?:minimum|or more|and above)\b",candidate_text,re.I)]
    plus=[float(x) for x in re.findall(r"\b(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    exact=[float(x) for x in re.findall(r"\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)(?:\s+of)?\s+(?:relevant\s+|professional\s+|work\s+|hands-on\s+)?experience\b",candidate_text,re.I)]
    exact += [float(x) for x in re.findall(r"\bexperience(?:\s+of)?\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    exact += [float(x)/12 for x in re.findall(r"\b(\d+)\s*months?\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b",candidate_text,re.I)]
    # A range endpoint can also match an exact-value phrase (for example the
    # "18 months" in "6-18 months of experience"). Keep the full range.
    range_endpoints={value for lo,hi in ranges+month_ranges+mixed_ranges for value in (lo,hi)} | set(upper_bounds)
    exact=[value for value in exact if value not in range_endpoints]
    constraints=[(lo,hi,"range") for lo,hi in ranges+month_ranges+mixed_ranges]
    constraints += [(0.0,hi,"upper") for hi in upper_bounds]
    lower_values=lower_bounds+plus
    if lower_values and upper_bounds:
        constraints += [(max(lower_values),min(upper_bounds),"range")]
    else:
        constraints += [(lo,None,"lower") for lo in lower_values]
    constraints += [(value,value,"exact") for value in exact]
    if constraints:
        lo,hi,kind=max(constraints,key=lambda x:(x[0],float("inf") if x[1] is None else x[1]))
        if kind=="lower": return lo,None,f"{lo:g}+"
        return lo,hi,f"{lo:g}–{hi:g}" if lo!=hi else f"{lo:g}"
    if junior:return 0.0,None,"Fresher"
    return None,None,"Unknown"

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
    job.experience_min,job.experience_max,job.experience_label=extract_experience(candidate_text(job.description, include_preferred=False))
    corpus=f"{job.title} {candidate_text(job.description)}".lower(); job.skills=[s for s in SKILLS if skill_present(s,corpus)]
    age=posted_age_hours(job.posted_at)
    reported=job.reported_age_hours
    employer_says_today=bool(job.posted_label and re.search(r"\b(?:posted\s+)?today\b",job.posted_label,re.I))
    calendar_today=False
    if job.posted_at and job.posted_precision=="day":
        try: calendar_today=datetime.fromisoformat(job.posted_at.replace("Z","+00:00")).astimezone(INDIA_TZ).date()==datetime.now(INDIA_TZ).date()
        except (TypeError,ValueError): pass
    recent=(age is not None and -6 <= age <= MAX_JOB_AGE_HOURS) or (reported is not None and 0 <= reported <= MAX_JOB_AGE_HOURS) or employer_says_today or calendar_today
    bounded_experience=job.experience_min is not None and job.experience_max is not None and job.experience_min >= 0 and job.experience_max <= MAX_EXPERIENCE_YEARS
    accepted_plus=job.experience_min is not None and job.experience_max is None and 0 <= job.experience_min <= 2
    experience_ok=bounded_experience or accepted_plus
    leadership_title=re.sub(r"\bmember of technical staff\b", "technical contributor", job.title, flags=re.I)
    leadership=bool(LEADERSHIP_TITLE.search(leadership_title))
    explicit_entry_title=bool(re.search(r"\b(?:associate|junior|graduate|trainee|fresher)\b|\b(?:sde|swe|software engineer|qa engineer|sdet|support engineer)\s*(?:i|1)\b",job.title,re.I))
    if job.experience_min is None and explicit_entry_title:
        job.experience_label="Entry-level title — experience unverified"
        experience_ok=False
    if job.city not in TARGET_CITIES: reason="Outside target cities"
    elif leadership: reason="Leadership-level title"
    elif job.role_category=="Other": reason="Role outside target list"
    elif job.employment_type=="Internship" and not recent: reason="Posting date not verified within 24 hours"
    elif job.employment_type=="Internship": reason="Eligible"
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
