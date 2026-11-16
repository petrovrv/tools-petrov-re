"""gen_ccuscost_solve: independent CCUS screening cost model reference generator (stdlib only).

Solve-level cases for ccuscost (simplified in-hub stage models, no stage modules loaded):
stage cost aggregation, energy use and costs, avoided/reduced/removed tonnes per methodology
(IEAGHG cost of CO2 avoided; EU ETS MRR 2018/2066; CRCF 2024/3012 BioCCS net removal).
Imported by gen_ccuscost.py.
"""
import math

COMP = {"IG": (1.9, 0.82, 1300.0, 0.67), "INL": (3.0, 0.78, 1600.0, 0.60)}
PHASE = {"dense": (850.0, 8e-5, 1.5, 90.0, 3.0), "gas": (85.0, 1.5e-5, 15.0, 15.0, 20.0)}
OD_IN = {6: 6.625, 8: 8.625, 10: 10.75, 12: 12.75}
NPS_LIST = [6, 8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 42, 48]


def _id_m(n):
    return OD_IN.get(n, float(n)) * 0.0254 - 0.0254


def solve_ref(i):
    mt, y, bio, loc = i["mt"], i["y"], i["bio"], i["loc"]
    elec, gas, cm = i["elec"], i["gas"], i["capex_mult"]
    t_cap = mt * 1e6
    yc = max(y, 0.1)
    # CAPTURE
    if y >= 90:
        q, e_aux, solv = 0.02, 8.0, 0.0
        c_cap = 20 * mt * 1e6 * mt ** (0.65 - 1) * loc
    else:
        f_eta = 1 + 1.5 * (i["eta"] - 0.9)
        f_s = 0.75 if i["solvent"] == "ADV" else 1.0
        q = (2.9 + 4.5 / yc) * f_eta * f_s
        e_aux = 25 + 200 / yc
        c_cap = 300e6 * mt ** 0.65 * (yc / 13) ** -0.25 * i["cf"] * loc
        solv = 1.2 * 1.8 if i["solvent"] == "MEA" else 0.35 * 4.0
    var = solv + (1.1 * q + 0.4) * 0.1
    gas_t = q * (1 - i["wh"]) / 3.6 / 0.9
    f_cap = 0.04 * c_cap
    pipe = i["transport"] == "pipe"
    # COMPRESSION
    w_comp, c_comp = 0.0, 0.0
    if pipe:
        rmax, eta_p, c_ref, ex = COMP[i["comp_type"]]
        R, M, T1, k = 8.314, 44.01, 313.15, 1.29
        p_in, p_out = i["p_in"], i["p_out"]
        p_sw = min(p_out, 80.0)
        w_gas = 0.0
        if p_sw > p_in:
            N = max(1, math.ceil(math.log(p_sw / p_in) / math.log(rmax) - 1e-9))
            r = (p_sw / p_in) ** (1.0 / N)
            x = (k - 1) / (k * eta_p)
            wst = R * T1 / M / x * (r ** x - 1) / eta_p
            w_gas = 1.05 * sum((1 - 0.005 * 0.5 * p_in * (r ** s + r ** (s + 1))) * wst
                               for s in range(N))
        w_pump = (p_out - 80) * 1e5 / (750 * 0.75) / 3600 if p_out > 80 else 0.0
        w_comp = (w_gas / 3.6 + w_pump) / 0.96
        P_kW = w_comp * mt * 1e6 / 8760
        if P_kW > 0:
            c_comp = c_ref * 1e4 * (P_kW / 1e4) ** ex * loc
    f_comp = 0.03 * c_comp
    # TRANSPORT
    P_W, loss, e_liq, freight = 0.0, 0.0, 0.0, 0.0
    if pipe:
        rho, mu, vt, pmin, _vmax = PHASE[i["phase"]]
        p_out, L_km = i["p_out"], i["L_km"]
        mdot = mt * 1e9 / 31.536e6
        Q = mdot / rho
        Dmin = math.sqrt(4 * Q / (math.pi * vt))
        nps = next((n for n in NPS_LIST if _id_m(n) >= Dmin), 48)
        ID = _id_m(nps)
        v = Q / (math.pi * ID ** 2 / 4)
        Re = rho * v * ID / mu
        f = 0.25 / math.log10(45e-6 / (3.7 * ID) + 5.74 / Re ** 0.9) ** 2
        dpdL = f * rho * v ** 2 / (2 * ID)
        if p_out > pmin:
            L_b = (p_out - pmin) * 1e5 / dpdL
            Nb = max(0, math.ceil(L_km * 1000 / L_b) - 1)
            if i["phase"] == "dense":
                P_W = Nb * mdot * (p_out - pmin) * 1e5 / (rho * 0.75)
            else:
                P_W = (Nb * mdot * (1.3 / 0.3) * 0.8 * 8.314 * 313.15 / 0.04401
                       * ((p_out / pmin) ** (0.3 / 1.3) - 1) / 0.75)
        c_tr = (L_km * (0.25 + 0.045 * nps) * 1e6 * (1.7 if i["storage_offshore"] else 1.0) * loc
                + 1500 * P_W / 1000 * loc)
        f_tr = 0.015 * c_tr
    else:
        lp = i["ship_mode"] == "LP"
        dist = i["ship_dist_km"]
        e_liq = (110.0 if lp else 95.0) + 2
        c_tr = (45 * (1.1 if lp else 1.0) + 60) * mt * 1e6 * mt ** (0.65 - 1) * loc
        f_tr = 0.04 * c_tr
        freight = (6 + 1.2 * max(dist, 100) / 100) * (0.85 if lp else 1.0)
        loss = 0.002 * (2 * dist / 25.9 / 24 + 2)
    tariff = 15.0 if i["storage_offshore"] else 8.0
    # TONNES
    t_sto = t_cap * (1 - loss)
    elec_MWh = t_cap * (e_aux + w_comp + e_liq) / 1000 + P_W * 8760 / 1e6
    gas_MWh = t_cap * gas_t
    gas_em = 0.202 * gas_MWh
    ind = gas_em + i["ef"] * elec_MWh
    t_iea = max(0.0, t_sto - ind)
    t_ets = max(0.0, t_sto * (1 - bio) - gas_em)
    ghg = bio * ind if i["crcf_alloc"] == "prorata" else ind
    t_rem = max(0.0, t_sto * bio - ghg) if bio > 0 else 0.0
    m = i["method"]
    if m not in ("ieaghg", "ets", "crcf"):
        m = "crcf" if bio > 0 else "ieaghg"
    if m == "crcf" and bio == 0:
        m = "ieaghg"
    metric_t, share = {"ets": (t_ets, 1.0), "crcf": (t_rem, bio)}.get(m, (t_iea, 1.0))
    # COSTS
    crf = i["disc"] / (1 - (1 + i["disc"]) ** -i["life"])
    stages = [
        (c_cap * 1.25 * cm, f_cap * cm + 2.5e6 * mt,
         t_cap * e_aux / 1000 * elec + gas_MWh * gas, t_cap * var),
        (c_comp * 1.25 * cm, f_comp * cm, t_cap * w_comp / 1000 * elec, 0.0),
        (c_tr * 1.25 * cm, f_tr * cm, (t_cap * e_liq / 1000 + P_W * 8760 / 1e6) * elec,
         t_cap * freight),
        (0.0, 0.0, 0.0, t_sto * tariff),
    ]
    st = [(cx * crf + fo + en + ot) / t_sto for cx, fo, en, ot in stages]
    lcoc = sum(st)
    cpa = lcoc * t_sto * share / metric_t if metric_t > 0 else None
    return {"q_reb": q, "w_comp": w_comp, "elec_MWh_y": elec_MWh, "gas_MWh_y": gas_MWh,
            "t_stored": t_sto, "t_ieaghg": t_iea, "t_ets": t_ets, "t_removed": t_rem,
            "metric_t": metric_t, "method": m, "capture_eur_t": st[0],
            "compression_eur_t": st[1], "transport_eur_t": st[2], "storage_eur_t": st[3],
            "lcoc_simple": lcoc, "cost_per_t_avoided": cpa}


def _inp(**kw):
    d = {"mt": 1.0, "y": 22.0, "bio": 0.0, "wh": 0.0, "cf": 1.0, "loc": 1.0,
         "elec": 140.0, "gas": 48.0, "ef": 0.25, "eta": 0.9, "solvent": "MEA",
         "transport": "pipe", "L_km": 100.0, "phase": "dense", "p_in": 1.5, "p_out": 110.0,
         "comp_type": "IG", "ship_dist_km": 0.0, "ship_mode": "MP", "storage_offshore": True,
         "disc": 0.08, "life": 25, "capex_mult": 1.0, "method": "auto", "crcf_alloc": "full",
         "industry": "cement", "country": "NL"}
    d.update(kw)
    return d


CEM = {"y": 22.0, "mt": 1.0, "wh": 0.15, "cf": 1.15, "industry": "cement"}

_SPECS = [
    ("cement_pipe_offshore", "Cement 22% 1 Mt, dense pipe 100 km offshore, NL prices",
     _inp(**CEM)),
    ("ngcc_pipe_250", "NGCC 4% 1 Mt, pipe 250 km offshore, p_out 150 (pump stage)",
     _inp(y=4.0, industry="ngcc", L_km=250.0, p_out=150.0)),
    ("ammonia_pipe_onshore", "Ammonia 98% 0.4 Mt, pipe 50 km onshore (high-purity branch)",
     _inp(y=98.0, mt=0.4, industry="ammonia", L_km=50.0, storage_offshore=False)),
    ("wte_bio_full", "WtE 11% 0.3 Mt bio 0.5, pipe 80 km, CRCF full allocation",
     _inp(y=11.0, mt=0.3, bio=0.5, industry="wte", L_km=80.0, crcf_alloc="full")),
    ("wte_bio_prorata", "WtE 11% 0.3 Mt bio 0.5, pipe 80 km, CRCF prorata allocation",
     _inp(y=11.0, mt=0.3, bio=0.5, industry="wte", L_km=80.0, crcf_alloc="prorata")),
    ("bioethanol_ship_lp", "Bioethanol 99% bio 1, ship LP 600 km",
     _inp(y=99.0, mt=0.2, bio=1.0, industry="ethanol", transport="ship",
          L_km=0.0, ship_dist_km=600.0, ship_mode="LP")),
    ("cement_ship_mp_ets", "Cement ship MP 800 km, method ets",
     _inp(transport="ship", L_km=0.0, ship_dist_km=800.0, ship_mode="MP",
          method="ets", **CEM)),
    ("refinery_adv_gas_pipe", "Refinery 14% ADV eta 0.95, INL, gas phase p_out 35, 30 km onshore",
     _inp(y=14.0, mt=0.5, industry="refinery_fcc", solvent="ADV", eta=0.95, comp_type="INL",
          phase="gas", p_out=35.0, L_km=30.0, storage_offshore=False)),
    ("cement_crcf_fallback", "Cement bio 0 with method crcf (falls back to ieaghg)",
     _inp(method="crcf", **CEM)),
]

CASES = [{"id": cid, "kind": "solve", "note": note, "inputs": inp, "ref": solve_ref(inp)}
         for cid, note, inp in _SPECS]
