"""Tokenisation for the local embedding model.

Mirrors ``apps/api/src/vendor/capabilityDocument.ts`` deliberately: the same
words must survive on both sides, or a supplier's capability document and a work
package would be embedded from different vocabularies and the similarity between
them would measure the difference between two tokenisers.
"""

from __future__ import annotations

import re

# Ordinary connective vocabulary plus procurement boilerplate. A word earns its
# place here by appearing in almost every tender AND almost every supplier
# profile — words that carry domain meaning ("training", "storage", "supply")
# are deliberately absent even though they are common.
STOP_WORDS: frozenset[str] = frozenset(
    """
    the and for with that this from shall must will are was were have has had not all any our
    your their its into such than then them they which while where when what who can may also
    each other more most some very over under across within between through including include
    included provide provided providing based using used use need needs required requirement
    requirements solution solutions service services system systems project projects work works
    new one two per via should would could about after before during both been being

    government governmental department departmental ministry office official officer authority
    public tender procurement procure contract contracts contractual supplier suppliers vendor
    vendors bidder bidders proposal proposals scope clause annexure capability capabilities
    implementation implement implemented deliverable deliverables delivery deliver delivered
    organisation organization organisations organizations entity compliance compliant conformity
    specification specifications sanctioned outlay package packages programme programmes program
    furnish furnished submit submitted submission ensure maintain maintained comply applicable
    relevant respective existing present current valid total number cent percentage minimum
    maximum period date dates day days week weeks month months year years schedule scheduled
    duration commencing completed completion three four five six seven eight nine ten first
    second following above below rather given own access committed state states central national
    record records report reports reported reporting format level levels stage stages process
    processes support supported quality standard standards
    """.split()
)

_SPLIT = re.compile(r"[\s,;:/()\[\]{}\"'|\\]+")
_STRIP = re.compile(r"[^a-z0-9+#.-]")
_DIGITS = re.compile(r"^\d+$")


def _normalise(token: str) -> str:
    token = _STRIP.sub("", token.lower())
    return token.strip(".-")


def tokenise(text: str) -> list[str]:
    """Content words only, in the order they appear."""
    tokens: list[str] = []
    for raw in _SPLIT.split(text):
        token = _normalise(raw)
        if len(token) < 3:
            continue
        if token in STOP_WORDS:
            continue
        if _DIGITS.match(token):
            continue
        tokens.append(token)
    return tokens
