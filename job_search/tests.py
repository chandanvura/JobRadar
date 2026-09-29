import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from scraper.models import Job
from scraper.normalization import enrich
from job_search.run import match, remote_india

PROFILE = json.loads((Path(__file__).parent / "profile.example.json").read_text())


class ProfileTests(unittest.TestCase):
    def job(self, title="Junior DevOps Engineer", location="Bengaluru", description="1-2 years experience with AWS and Docker", posted="recent"):
        if posted == "recent":
            posted = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        return enrich(Job("1", title, "Example", location, description, "greenhouse", "company_career", "https://example.com/1", "https://example.com/1", "https://example.com", posted_at=posted))

    def test_location_and_experience(self):
        self.assertIsNotNone(match(self.job(), PROFILE))
        self.assertIsNone(match(self.job(location="London"), PROFILE))
        self.assertIsNone(match(self.job(description="5 years experience"), PROFILE))
        self.assertIsNone(match(self.job(title="DevOps Manager"), PROFILE))

    def test_remote_and_unknown_date(self):
        self.assertTrue(remote_india("Remote - India"))
        self.assertFalse(remote_india("Remote - US only"))
        self.assertEqual(match(self.job(location="Remote - India", posted=None), PROFILE)["freshness"], "Date unverified")


if __name__ == "__main__":
    unittest.main()
