from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Optional

@dataclass
class Company:
    name: str; careers_url: str; ats_provider: str; ats_identifier: str; priority: int = 3; enabled: bool = True

@dataclass
class Job:
    external_job_id: str; title: str; company: str; location: str; description: str; ats_provider: str
    source: str; job_url: str; application_url: str; career_page_url: str; posted_at: Optional[str] = None
    normalized_title: str = ""; normalized_location: str = ""; city: Optional[str] = None; role_category: str = "Other"
    experience_min: Optional[float] = None; experience_max: Optional[float] = None; experience_label: str = "Unknown"
    skills: list[str] = field(default_factory=list); relevance_score: int = 0; freshness_score: int = 0; priority_score: int = 0
    hiring_signal: Optional[str] = None; is_eligible: bool = False
    first_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    def as_dict(self): return asdict(self)
