"""No cryptography here - this file proves the scanner does not hallucinate.

The words hashlib.md5 and "AES-256" appear below only inside a docstring and a
string literal; a regex scanner would report two false positives.
"""


def add(a: int, b: int) -> int:
    return a + b


NOTES = "migration plan: move off hashlib.md5 to SHA-256, keep AES-256 for data at rest"


def scale(values, factor: int):
    return [add(v, factor) for v in values]
