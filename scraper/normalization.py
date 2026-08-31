import re
from datetime import datetime, timezone
from .models import Job

ROLE_PATTERNS = {
    "DevOps": r"\bdev\s*ops\b|\bbuild(?:/| and | & )?release\b|\brelease engineer\b|\bdeployment engineer\b", "Cloud": r"\bcloud (?:support )?engineer\b|\bcloud operations\b",
    "SRE": r"\bsite reliability\b|\bsre\b|\bproduction engineer\b", "Platform": r"\bplatform engineer\b",
    "Java / Backend": r"\bjava (?:developer|engineer)\b|\bbackend (?:developer|engineer)\b|\bsoftware engineer\s*[-–—:]?\s*java\b",
    "Software Engineering": r"\b(?:associate|junior|graduate)?\s*software engineer(?:ing)?(?:\s+(?:i|1))?\b|\bsde\s*(?:i|1)?\b|\bgraduate engineer trainee\b|\bget\b",
}
SENIOR = re.compile(r"\b(senior|sr\.?|lead|staff|principal|architect|manager|director|head|vp|vice president)\b",re.I)
SKILLS=["AWS","Azure","GCP","Linux","Docker","Kubernetes","Terraform","Jenkins","CI/CD","GitHub Actions","Argo CD","Ansible","Git","Helm","Bash","Python","Java","Spring Boot","Spring","REST API","Microservices","Kafka","SQL","PostgreSQL","MySQL","Redis","Prometheus","Grafana","ELK","Elasticsearch","Splunk","Datadog"]

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
    plus=[float(x) for x in re.findall(r"\b(\d+(?:\.\d+)?)\s*\+\s*(?:years?|yrs?|yoe)\b",candidate_text,re.I)]
    if ranges:
        lo,hi=min(ranges,key=lambda x:(x[0],x[1])); return lo,hi,f"{lo:g}–{hi:g}"
    if plus:
        lo=min(plus); return lo,None,f"{lo:g}+"
    if junior:return 0.0,1.0,"Fresher"
    return None,None,"Unknown"

def skill_present(skill: str, corpus: str):
    aliases={"CI/CD":r"\bci\s*/?\s*cd\b","REST API":r"\brest(?:ful)?\s+apis?\b","Spring":r"\bspring\b(?!\s+boot)","Git":r"\bgit\b(?!hub)","ELK":r"\belk\b"}
    return bool(re.search(aliases.get(skill,rf"(?<![a-z0-9]){re.escape(skill.lower())}(?![a-z0-9])"),corpus,re.I))

def enrich(job: Job, company_priority: int=3):
    job.normalized_title,job.role_category=classify_title(job.title); job.normalized_location,job.city=normalize_location(job.location)
    job.experience_min,job.experience_max,job.experience_label=extract_experience(f"{job.title}\n{job.description}")
    corpus=f"{job.title} {job.description}".lower(); job.skills=[s for s in SKILLS if skill_present(s,corpus)]
    explicitly_over=job.experience_min is not None and job.experience_min>=4
    job.is_eligible=job.city in {"Bengaluru","Hyderabad"} and job.role_category!="Other" and not SENIOR.search(job.title) and not explicitly_over
    job.freshness_score=35
    if job.posted_at:
        try:
            age=max(0,(datetime.now(timezone.utc)-datetime.fromisoformat(job.posted_at.replace("Z","+00:00"))).total_seconds()/3600)
            job.freshness_score=35 if age<1 else 30 if age<3 else 25 if age<6 else 18 if age<12 else 12 if age<24 else 5
        except ValueError: job.posted_at=None
    exp=25 if job.experience_min is not None and (job.experience_max or job.experience_min)<=3 else 17
    title=20 if job.role_category!="Other" else 0; skill=min(10,len(job.skills)*2); priority=min(5,max(1,company_priority))
    signal=re.search(r"actively hiring|immediate join(?:er|ing)?|urgent hiring|multiple (?:openings|positions)|early applicant",corpus,re.I); hiring=5 if signal else 0
    job.hiring_signal=signal.group(0).title() if signal else None; job.relevance_score=min(100,job.freshness_score+exp+title+skill+priority+hiring); job.priority_score=priority
    return job
