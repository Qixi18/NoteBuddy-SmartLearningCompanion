class DomainError(ValueError):
    """A business invariant was violated."""


class InvalidScore(DomainError):
    pass


class InvalidEvidence(DomainError):
    pass


class InvalidReview(DomainError):
    pass
