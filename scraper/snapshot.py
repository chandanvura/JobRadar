"""A changing public listing must restart, never pass relaxed count checks."""


class SnapshotChanged(ValueError):
    """Employer records changed between otherwise valid listing pages."""
