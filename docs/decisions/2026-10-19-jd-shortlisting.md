# JD experience verification

## Decision

Use the employer JD to verify experience for each full-time recommendation.
Do not treat a junior title, a stored numeric scan value, or recommendation
feedback as proof of a JD requirement. Unknown, preferred-only, conditional,
and contradictory requirements need review. They cannot approve a shortlist.

Keep the existing policy: bounded requirements must stay within 0–3 years.
Explicit fresher acceptance and minimum requirements of 0+, 1+, or 2+ remain
allowed. An open 3+ requirement remains outside this policy. These rules describe
the search range. They do not assert the user's actual work experience.

## Evidence and changes

- The parser treated “2 years of Java is not required” as a required minimum.
  Negated requirements now count as optional evidence.
- “Freshers are not eligible” and “No freshers” could become zero-experience
  acceptance. The parser now excludes that interpretation.
- A preferred prefix on the same line could hide a required number. Clauses
  now split before numeric and number-word preference prefixes.
- “3 years or less” now means a 0–3 upper bound.
- The browser could retain an old numeric approval when current JD text had no
  required experience evidence. It now clears that unsupported approval.
- Each card has an experience decision and expandable JD evidence. Role,
  location, posting date, and user filters remain separate shortlist checks.

## Verification

The shared fixtures run in both Python and JavaScript. Every fixture also runs
through full-time scraper eligibility and the browser recommendation gate.
The Nationwide India public JD clause, “One to three years of relevant
experience,” is included as a real employer example. Unknown or missing JDs
cannot inherit old numeric approval. No application history is changed.

The browser applies these checks when it loads the catalogue. The next scheduled
scan applies the new Python rules to ingestion and alert candidates. The parser
uses explicit rules, not a claim of perfect natural-language understanding.
