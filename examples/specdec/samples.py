"""Reference method sources — used by the key-free fake agent and tests."""

GOOD = '''\
from specdec import SpeculationStrategy

class Strategy(SpeculationStrategy):
    name = "ngram-lookup"
    def propose(self, context, k):
        for n in (4, 3, 2, 1):
            if len(context) < n:
                continue
            pat = context[-n:]
            for i in range(len(context) - n - 1, -1, -1):
                if context[i:i+n] == pat:
                    return context[i+n:i+n+k]
        return []
'''

BROKEN = '''\
from specdec import SpeculationStrategy

class Strategy(SpeculationStrategy):
    name = "broken"
    def propose(self, context, k):
        raise RuntimeError("this idea did not pan out")
'''
