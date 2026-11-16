# Independent Python reference for lopa_sil (written by Claude, 23.10.2026).
# Written from the published methods, not ported from the JS module:
#  - LOPA scenario frequency (CCPS, Layer of Protection Analysis, 2001, ch. 7):
#      f_mitigated = f_IE * prod(enabling/conditional modifiers) * prod(PFD_IPL)
#  - generic IE frequencies and IPL PFDs: CCPS 2001 tables 5.1, 6.3, 6.5 (upper value of each range)
#  - required risk reduction RRF = f_mitigated / f_tolerable and SIL from IEC 61511-1:2016+A1:2017 Table 4
#    (low demand: SIL n <=> RRF > 10^n and <= 10^(n+1))
#  - PFDavg of the proposed SIF from the IEC 61508-6:2010 Annex B.3.2.2 general equations with
#    lambda_DD = 0 and MRT = MTTR = 0 (channel equivalent / group equivalent mean down times)
#  - hardware fault tolerance limit IEC 61511-1:2016 Table 6 (SIL 1-2: HFT 0, SIL 3: HFT 1, SIL 4: HFT 2)
import json, math, os

IE_F = {'bpcs_loop': 0.1, 'pump_seal': 0.1, 'hose': 0.1, 'regulator': 0.1, 'gasket': 0.01,
        'prv_spurious': 0.01, 'third_party': 0.01}
IPL_PFD = {'bpcs': 0.1, 'alarm': 0.1, 'prv': 0.01, 'disc': 0.01, 'dike': 0.01, 'arrester': 0.01,
           'blastwall': 0.01, 'sif1': 0.1, 'sif2': 0.01, 'sif3': 0.001}


def sil_from_rrf(rrf):
    """IEC 61511-1 Table 4 by risk reduction factor: -1 none needed (RRF <= 1), 0 for 1 < RRF <= 10,
    n for 10^n < RRF <= 10^(n+1), 5 beyond SIL 4 (RRF > 1e5)."""
    if rrf <= 1:
        return -1
    n = 0
    bound = 10.0
    while rrf > bound * (1 + 1e-12) and n < 5:
        n += 1
        bound *= 10.0
    return n


def pfd_moon(M, N, lam, T1, beta):
    """IEC 61508-6 B.3.2.2, lambda_DD = 0, MRT = 0: independent part uses tCE = T1/2, tGE = T1/3,
    tG2E = T1/4; common cause part beta*lambda_DU*T1/2."""
    li = (1 - beta) * lam
    t = [T1 / 2, T1 / 3, T1 / 4]
    k = N - M + 1                      # number of channel failures needed to fail the function
    if M == N:                         # NooN: any single failure fails it -> N * lambda * tCE
        return N * lam * t[0]
    # (k)oo... failures among N channels: N!/(N-k)! * prod(li * t_j)
    perm = math.factorial(N) // math.factorial(N - k)
    ind = perm
    for j in range(k):
        ind *= li * t[j]
    return ind + beta * lam * t[0]


def compute(c):
    f_ie = c['f_ie'] if c['ie'] == 'custom' else IE_F[c['ie']]
    f = f_ie * c['p_enable'] * c['p_ign'] * c['p_occ'] * c['p_vuln']
    for x in c['ipls']:
        f *= x['pfd'] if x['type'] == 'custom' else IPL_PFD[x['type']]
    rrf = f / c['f_target']
    sil = sil_from_rrf(rrf)
    out = {'f_mit': f, 'pfd_req': 1 / rrf, 'rrf_req': rrf, 'sil_req': sil, 'gap_orders': math.log10(rrf)}
    s = c.get('sif')
    if s:
        M, N = int(s['arch'][0]), int(s['arch'][3])
        pfd = pfd_moon(M, N, s['lambdaDU_h'], s['TI_h'], s['beta'])
        sil_pfd = min(max(sil_from_rrf(1 / pfd), 0), 4)
        hft = N - M
        cap = {0: 2, 1: 3, 2: 4}[hft]
        ach = min(sil_pfd, cap)
        ff = f * pfd
        out.update({'sif_pfd': pfd, 'sif_sil_achieved': ach, 'sif_f_final': ff,
                    'sif_meets': bool(ff <= c['f_target'] * (1 + 1e-12) and ach >= sil)})
    return out


DEF = dict(ie='bpcs_loop', f_ie=0.1, p_enable=1, p_ign=1, p_occ=0.5, p_vuln=0.5, ipls=[{'type': 'alarm'}],
           f_target=1e-5, sif={'arch': '1oo2', 'lambdaDU_h': 2e-6, 'TI_h': 8760, 'beta': 0.1})
CASES = [
    ('L1', 'default: BPCS failure, alarm, 1oo2 SIF', {}),
    ('L2', 'same with 1oo1 SIF (PFD in SIL 2 band but target missed)', dict(sif={'arch': '1oo1', 'lambdaDU_h': 2e-6, 'TI_h': 8760, 'beta': 0.1})),
    ('L3', 'tank overfill with dike, no SIF needed', dict(p_ign=0.1, p_occ=1, p_vuln=0.5, ipls=[{'type': 'alarm'}, {'type': 'dike'}], sif=None)),
    ('L4', 'H2 compressor seal leak, 1oo1', dict(ie='pump_seal', p_ign=0.3, p_occ=0.2, p_vuln=1, sif={'arch': '1oo1', 'lambdaDU_h': 1e-6, 'TI_h': 8760, 'beta': 0.1})),
    ('L5', 'hose rupture, 1e-6 target, 2oo3', dict(ie='hose', p_ign=0.5, p_occ=1, p_vuln=1, ipls=[{'type': 'alarm'}, {'type': 'blastwall'}], f_target=1e-6, sif={'arch': '2oo3', 'lambdaDU_h': 1e-6, 'TI_h': 8760, 'beta': 0.05})),
    ('L6', 'custom IE 0.5/yr, custom IPL 0.05, 2oo2', dict(ie='custom', f_ie=0.5, p_occ=1, p_vuln=1, ipls=[{'type': 'custom', 'pfd': 0.05}], sif={'arch': '2oo2', 'lambdaDU_h': 5e-7, 'TI_h': 4380, 'beta': 0.1})),
    ('L7', 'high RRF, 1oo3 HFT 2, 1e-7 target', dict(ie='regulator', p_occ=1, p_vuln=1, ipls=[], f_target=1e-7, sif={'arch': '1oo3', 'lambdaDU_h': 3e-6, 'TI_h': 17520, 'beta': 0.02})),
    ('L8', 'HFT cap: 1oo1 with very low PFD limited to SIL 2', dict(ie='gasket', p_occ=1, p_vuln=1, ipls=[{'type': 'prv'}], f_target=1e-7, sif={'arch': '1oo1', 'lambdaDU_h': 1e-8, 'TI_h': 8760, 'beta': 0.1})),
]
out = []
for cid, note, ov in CASES:
    inp = json.loads(json.dumps(dict(DEF, **ov)))
    out.append({'id': cid, 'note': note, 'inputs': inp, 'ref': compute(inp)})
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lopa_sil_ref.json')
with open(path, 'w') as f:
    json.dump(out, f, indent=2)
print(len(out))
