import re
from datetime import datetime, timezone
from .models import Job

ROLE_PATTERNS = {
    "DevOps": r"\bdev\s*ops\b|\bbuild(?:/| and | & )?release\b|\brelease engineer\b|\bdeployment engineer\b", "Cloud": r"\bcloud (?:support )?engineer\b|\bcloud operations\b",
    "SRE": r"\bsite reliability\b|\bsre\b|\bproduction engineer\b", "Platform": r"\bplatform engineer\b",
    "Java / Backend": r"\bjava (?:developer|engineer)\b|\bbackend (?:developer|engineer)\b|\bsoftware engineer\s*[-–—:]?\s*java\b",
    "Software Engineering": r"\b(?:associate|junior|graduate)?\s*software engineer(?:ing)?(?:\s+(?:i|1))?\b|\bsde\s*(?:i|1)?\b|\bgraduate engineer trainee\b|\bget\b",
}
SKILLS=["AWS","Azure","GCP","Linux","Docker","Kubernetes","Terraform","Jenkins","CI/CD","GitHub Actions","Argo CD","Ansible","Git","Helm","Bash","Python","Java","Spring Boot","Spring","REST API","Microservices","Kafka","SQL","PostgreSQL","MySQL","Redis","Prometheus","Grafana","ELK","Elasticsearch","Splunk","Datadog"]
MAX_JOB_AGE_HOURS = 24
MAX_EXPERIENCE_YEARS = 3

def normalize_location(value: str):
    low=value.lower(); hybrid=" · Hybrid" if "hybrid" in low else ""
    if re.search(r"\bbangalore\b|\bbengaluru\b",low): return "Bengaluru"+hybrid,"Bengaluru"
    if re.search(r"\bhyderabad\b",low): return "Hyderabad"+hybrid,"Hyderabad"
    return value.strip() or "Not specified",None

def classify_title(title: str):
    clean=re.sub(r"[^a-z0-9+]+"," ",title.lower()).strip()
    for category,pattern in ROLE_PATTERNS.items():
        if re.search(pattern,clean,re.I): return clean,category
    return clean,"Other"

def extract_experience(text: str):
    junior=re.search(r"\b(fresher|fresh graduate|new graduate|entry.?level|recent graduate)\b",text,re.I)
    clauses=re.split(r"[\n.;•]+",text)
    relevant=[c for c in clauses if re.search(r"\b(years?|yrs?|yoe|experience|fresher|graduate)\b",c,re.I) and not re.search(r"\b(company|organisation|organization|founded|serving|combined|team has)\b.{0,35}\b(years?|experience)\b",c,re.I)]
    candidate_text=" ".join(relevant)
    ranges=[(float(a),float(b)) for a,b in re.findall(r"\b(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    lower_bounds=[float(x) for x in re.findall(r"\b(?:at least|minimum(?: of)?|more than|over)\s*(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    plus=[float(x) for x in re.findall(r"\b(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    exact=[float(x) for x in re.findall(r"\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?|yoe)\s+(?:of\s+)?(?:relevant\s+|professional\s+|work\s+)?experience\b",candidate_text,re.I)]
    # Use the strictest explicit requirement. Choosing the smallest number lets
    # descriptions such as "2+ years in Java, 5+ years overall" slip through.
    if ranges:
        lo,hi=max(ranges,key=lambda x:(x[1],x[0])); return lo,hi,f"{lo:g}–{hi:g}"
    if lower_bounds or plus:
        lo=max(lower_bounds+plus); return lo,None,f"{lo:g}+"
    if exact:
        value=max(exact); return value,value,f"{value:g}"
    if junior:return 0.0,1.0,"Fresher"
    return None,None,"Unknown"

def skill_present(skill: str, corpus: str):
    aliases={"CI/CD":r"\bci\s*/?\s*cd\b","REST API":r"\brest(?:ful)?\s+apis?\b","Spring":r"\bspring\b(?!\s+boot)","Git":r"\bgit\b(?!hub)","ELK":r"\belk\b"}
    return bool(re.search(aliases.get(skill,rf"(?<![a-z0-9]){re.escape(skill.lower())}(?![a-z0-9])"),corpus,re.I))

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
    job.normalized_title,job.role_category=classify_title(job.title); job.normalized_location,job.city=normalize_location(job.location)
    job.experience_min,job.experience_max,job.experience_label=extract_experience(f"{job.title}\n{job.description}")
    corpus=f"{job.title} {job.description}".lower(); job.skills=[s for s in SKILLS if skill_present(s,corpus)]
    age=posted_age_hours(job.posted_at)
    reported=job.reported_age_hours
    employer_says_today=bool(job.posted_label and re.search(r"\bposted\s+today\b",job.posted_label,re.I))
    recent=(age is not None and -1 <= age <= MAX_JOB_AGE_HOURS) or (reported is not None and 0 <= reported <= MAX_JOB_AGE_HOURS) or employer_says_today
    bounded_experience=job.experience_min is not None and job.experience_max is not None and job.experience_min >= 0 and job.experience_max <= MAX_EXPERIENCE_YEARS
    accepted_plus=job.experience_min is not None and job.experience_max is None and 0 <= job.experience_min <= 2
    experience_ok=bounded_experience or accepted_plus
    if job.city not in {"Bengaluru","Hyderabad"}: reason="Outside Bengaluru/Hyderabad"
    elif job.role_category=="Other": reason="Role outside target list"
    elif not experience_ok: reason="Experience is unknown or exceeds policy"
    elif not recent: reason="Posting time is unknown or older than 24 hours"
    else: reason="Eligible"
    job.is_eligible=reason=="Eligible"; job.eligibility_reason=reason
    effective_age=age if age is not None else reported
    job.freshness_score=12 if employer_says_today else 0 if effective_age is None or effective_age > MAX_JOB_AGE_HOURS else 35 if effective_age<1 else 30 if effective_age<3 else 25 if effective_age<6 else 18 if effective_age<12 else 12
    exp=25 if experience_ok else 0
    title=20 if job.role_category!="Other" else 0; skill=min(10,len(job.skills)*2); priority=min(5,max(1,company_priority))
    signal=re.search(r"actively hiring|immediate join(?:er|ing)?|urgent hiring|multiple (?:openings|positions)|early applicant",corpus,re.I); hiring=5 if signal else 0
    job.hiring_signal=signal.group(0).title() if signal else None; job.relevance_score=min(100,job.freshness_score+exp+title+skill+priority+hiring); job.priority_score=priority
    return job
