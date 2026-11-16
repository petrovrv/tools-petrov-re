"""Path resolution for every reference generator in this directory.

The generators were written against one machine's layout: 31 of the 49 python files here
hold a literal '/root/bench/ref/...', '/root/bench/tmp/...' or '/root/site/...'. Neither
/root/bench nor /root/site exists in this container, so a generator run here wrote nothing
and the corpus it is supposed to produce could not be regenerated -- which is the same
defect benchpaths.mjs removed from the drivers, in the other half of the harness.

This module is the single resolver, and it mirrors benchpaths.mjs so the two halves resolve
one tree one way. A generator names what it wants by name, not by path; every path resolves
relative to THIS file's own tree, so a generator run in a workspace writes into that
workspace. Flags beat environment variables, which beat the defaults:

    reference dir   --ref-dir   BENCH_REF_DIR      this file's directory
    site root       --site      BENCH_SITE_ROOT    parent of bench-src
    scratch dir     --tmp-dir   BENCH_TMP_DIR      <ref dir>/_tmp

Two helpers carry the rest:

    ref('x_ref.json')   a file in the reference directory
    site('x.html')      a file in the site root
    tmp('x.json')       a file in the scratch directory, created on demand
    label('gen_x.py')   the site-relative name of a generator, for a 'generated_by' string
                        that is published inside an artifact: 'bench-src/ref/gen_x.py'.
                        A published provenance string names a path in the deployment, never
                        a path on the machine that happened to run it.

need_ref('x.json') is the read-side check: it raises with the flag and the environment
variable that set the directory, at the point the generator starts, instead of an ENOENT
from inside a json.load several functions later.
"""
import os
import sys

__all__ = ['REF_DIR', 'SITE_ROOT', 'TMP_DIR', 'ref', 'site', 'tmp', 'label', 'need_ref']


def _flag(name):
    """--name value and --name=value, read from sys.argv."""
    argv = sys.argv[1:]
    for i, a in enumerate(argv):
        if a == '--' + name and i + 1 < len(argv):
            return argv[i + 1]
        if a.startswith('--' + name + '='):
            return a.split('=', 1)[1]
    return None


def _pick(flag_name, env_name, default):
    v = _flag(flag_name)
    if v:
        return os.path.abspath(v)
    v = os.environ.get(env_name)
    if v:
        return os.path.abspath(v)
    return default


REF_DIR = _pick('ref-dir', 'BENCH_REF_DIR', os.path.dirname(os.path.abspath(__file__)))
SITE_ROOT = _pick('site', 'BENCH_SITE_ROOT', os.path.dirname(os.path.dirname(REF_DIR)))
TMP_DIR = _pick('tmp-dir', 'BENCH_TMP_DIR', os.path.join(REF_DIR, '_tmp'))


def ref(name):
    return name if os.path.isabs(name) else os.path.join(REF_DIR, name)


def site(name):
    return name if os.path.isabs(name) else os.path.join(SITE_ROOT, name)


def tmp(name):
    os.makedirs(TMP_DIR, exist_ok=True)
    return name if os.path.isabs(name) else os.path.join(TMP_DIR, name)


def label(name):
    return 'bench-src/ref/' + os.path.basename(name)


def need_ref(name):
    p = ref(name)
    if not os.path.isfile(p):
        raise SystemExit('the reference input "%s" does not exist: %s '
                         '(set the directory with --ref-dir or BENCH_REF_DIR)' % (name, p))
    return p
