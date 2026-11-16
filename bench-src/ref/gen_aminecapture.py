#!/usr/bin/env python3
# Reference generator for aminecapture.html (Claude, 2026-10-19).
# Independent re-implementation of the documented screening correlations
# (_ccus/capture-work/spec-02, spec-03a, spec-03b-04; ccus-spec-partial.md A1); does NOT import ccus-capture.js.
# Synced to ccus-capture.js VERSION 2026-10-19.2 (refit to plant data).
# Correlations are indicative literature recall (IEAGHG 2019-09, NETL Rev4, Moser 2020, Rochelle 2011).
import json, math, os

SOLV = {  # fs, alphaOpt, alphaRich, makeup kg/t, price EUR/kg
    "MEA": (1.00, 0.22, 0.48, 1.0, 1.8),
    "CESAR1": (0.84, 0.15, 0.43, 0.45, 3.5),
    "KS21": (0.75, 0.15, 0.50, 0.3, 5.0),
    "PZ": (0.78, 0.22, 0.39, 0.2, 4.0),
}

BASE = dict(mdotSrc=1e9 / (8000 * 3600), y=0.20, eta=0.90, solvent="MEA", heat="steam",
            whFrac=0.0, fanDp=15000.0, alphaLean=0.22, pStr=1.9e5, hours=8000.0, rate=0.08,
            life=25, capexFactor=1.0, steamPrice=10.0, gasPrice=35.0, elecPrice=80.0,
            co2Price=145.0, cwPrice=0.4, gridEF=0.25)


def solv(s):
    d = {"solvent": s, "alphaLean": SOLV[s][1]}
    if s == "KS21":
        d["pStr"] = 1.7e5
    elif s == "PZ":
        d["pStr"] = 6e5
    return d


def compute(p):
    fs, aO, _aR, mk, pr = SOLV[p["solvent"]]
    y, eta, a = p["y"], p["eta"], p["alphaLean"]
    m = p["mdotSrc"] * eta
    ypct = 100.0 * y
    hp = y >= 0.9
    nFlue = p["mdotSrc"] / 44.01 / y
    if hp:
        qGJ, aux = 0.075, 10.0
        Qc = 0.1 * qGJ * 1e6 * m
        trains, D = 0, 0.0
    else:
        f_eta = 1 + 1.5 * max(0.0, eta - 0.90)
        f_LL = 1 + 0.10 * max(0.0, (aO - a) / 0.05) + 0.05 * max(0.0, (a - aO) / 0.05)
        if p["solvent"] == "PZ":
            f_P = 1 - 0.02 * (p["pStr"] / 1e5 - 6)
        else:
            f_P = 1 - 0.04 * (p["pStr"] / 1e5 - 1.9)
        qGJ = (3.45 + 1.2 / ypct) * f_eta * fs * f_LL * f_P
        Vflue = nFlue * 22.414
        Pfan = Vflue * p["fanDp"] / 0.8
        e_fan = Pfan / m / 3600
        aux = e_fan + 5 + 2.4 * qGJ + 5
        Qc = (1.1 * qGJ + 0.4) * 1e6 * m
        Vact = nFlue * 1000 * 8.314 * 313.15 / 101325
        A = Vact / 2.5
        Dreq = math.sqrt(4 * A / math.pi)
        trains = max(1, math.ceil((Dreq / 14) ** 2 - 1e-9))
        D = math.sqrt(4 * A / trains / math.pi)
    q_reb = qGJ * 1e6
    e_aux = aux * 3600
    Paux = aux * m * 3600
    Qext = q_reb * m * (1 - p["whFrac"])
    steam = Qext / 2.15e6
    PelLost = PelHeat = fuel = co2Fuel = 0.0
    ht = p["heat"]
    if ht == "extraction":
        PelLost = Qext / 1e9 * 55 * 3.6e6
    elif ht == "gasBoiler":
        fuel = Qext / 0.90
        co2Fuel = fuel * 0.202 / 3.6e6
    elif ht == "eBoiler":
        PelHeat = Qext / 0.99
    elif ht == "heatPump":
        PelHeat = Qext / 2.3
    co2Ind = co2Fuel + (Paux + PelHeat + PelLost) * p["gridEF"] / 3.6e6
    netAv = m - co2Ind
    h = p["hours"] * 3600
    tpa = m * h / 1000
    if hp:
        capex = 17.5 * tpa * p["capexFactor"]
    else:
        S = m / (125 / 3.6)
        F = (m / y) / ((125 / 3.6) / 0.175)
        capex = 350e6 * p["capexFactor"] * (0.5 * F ** 0.65 + 0.5 * S ** 0.65)
    i, n = p["rate"], p["life"]
    crf = 1.0 / n if i == 0 else i * (1 + i) ** n / ((1 + i) ** n - 1)
    capital = capex * crf
    fom = 0.035 * capex + 2e6 * (0.25 if hp else 1.0)
    if ht == "steam":
        heat = Qext * h / 1e9 * p["steamPrice"]
    elif ht == "extraction":
        heat = PelLost * h / 3.6e9 * p["elecPrice"]
    elif ht == "gasBoiler":
        heat = fuel * h / 3.6e9 * p["gasPrice"] + co2Fuel * h / 1000 * p["co2Price"]
    else:
        heat = PelHeat * h / 3.6e9 * p["elecPrice"]
    elec = Paux * h / 3.6e9 * p["elecPrice"]
    solvent = 0.0 if hp else mk * pr * tpa
    cooling = Qc * h / 1e9 * p["cwPrice"]
    total = capital + fom + heat + elec + solvent + cooling
    return {"q_reb": q_reb, "e_aux": e_aux, "steam": steam, "Q_cool": Qc, "capex": capex,
            "cost_captured": total / tpa,
            "cost_avoided": total / (netAv * h / 1000) if netAv > 0 else None,
            "avoided_fraction": netAv / p["mdotSrc"],
            "absorber_trains": trains, "absorber_D": D}


NGCC = dict(y=0.04, mdotSrc=1.2e9 / (8000 * 3600), heat="extraction")
CASES = [
    ("base_cement_MEA", "Cement kiln, MEA, purchased steam", {}),
    ("ngcc_MEA_extraction", "NGCC 4% CO2, MEA, steam extraction", dict(NGCC)),
    ("ngcc_KS21_95", "NGCC, KS21, 95% capture", {**NGCC, **solv("KS21"), "eta": 0.95}),
    ("cement_CESAR1_heatpump", "Cement, CESAR1, heat pump", {**solv("CESAR1"), "heat": "heatPump"}),
    ("steel_CESAR1_gasBoiler", "Steel 25% CO2, CESAR1, gas boiler",
     {"y": 0.25, "mdotSrc": 1.5e9 / 28.8e6, **solv("CESAR1"), "heat": "gasBoiler"}),
    ("wte_MEA_wh30", "WtE 11% CO2, MEA, 30% waste heat",
     {"y": 0.11, "mdotSrc": 4e8 / 28.8e6, "whFrac": 0.3}),
    ("coal_PZ_6bar", "Coal 13% CO2, PZ 6 bar, extraction",
     {"y": 0.13, "mdotSrc": 3e9 / 28.8e6, **solv("PZ"), "heat": "extraction"}),
    ("MEA_offdesign", "MEA off-design lean loading/pressure, 95% capture",
     {"alphaLean": 0.30, "pStr": 2.1e5, "fanDp": 10000.0, "eta": 0.95}),
    ("eboiler_MEA", "MEA, e-boiler, low-carbon grid, financial overrides",
     {"heat": "eBoiler", "gridEF": 0.05, "rate": 0.06, "life": 20, "capexFactor": 1.2}),
    ("large_lowCO2", "Large 3.5% CO2 source, several absorber trains",
     {"y": 0.035, "mdotSrc": 3e9 / 28.8e6}),
    ("bioethanol_hp", "Bioethanol fermentation 98% CO2, high-purity branch",
     {"y": 0.98, "mdotSrc": 2e8 / 28.8e6}),
]

# ---- Plant-data validation set (Claude, 2026-10-20): published specific reboiler duty,
# compared with tolerance +-10 % (kind "plant"); values approximate, see notes.
TOL_PLANT = 0.10


def _p(id, source, plant, y, eta, solvent, q_pub, q_range, other, note):
    return dict(id=id, source=source, plant=plant, y=y, eta=eta, solvent=solvent,
                q_pub=q_pub, q_range=q_range, other=other, note=note)


PLANT = [
    _p("esbjerg_mea", "Knudsen et al. 2007/2009 (CASTOR)", "Esbjerg coal PP pilot",
       0.12, 0.90, "MEA", 3.7, (3.5, 3.8), {},
       "30 wt% MEA reference campaign; y ~12-13% coal flue."),
    _p("tcm_mea_2018", "Faramarzi/Gjernes et al. 2018-2019", "TCM Mongstad",
       0.037, 0.88, "MEA", 3.6, (3.5, 3.8), {},
       "CHP gas-turbine flue ~3.5-4% CO2; eta 85-90% across tests."),
    _p("niederaussem_cesar1", "Moser et al., IJGGC 2021", "Niederaussem lignite pilot",
       0.145, 0.90, "CESAR1", 2.95, (2.9, 3.0), {"makeup_kg_t": 0.45},
       "AMP/PZ (CESAR1) long-term test; y ~14-15% lignite flue."),
    _p("kaiserslautern_mea", "Mangalapally & Hasse 2010/2011", "TU Kaiserslautern pilot",
       0.13, 0.90, "MEA", 3.65, (3.6, 3.7), {},
       "Synthetic flue (NG burner + added CO2), ~13% CO2."),
    _p("cement_mea", "CEMCAP / TCM cement-like tests", "Cement flue (TCM test)",
       0.175, 0.90, "MEA", 3.5, (3.4, 3.6), {},
       "Lower confidence: MEA cement figures from TCM tests / CEMCAP work."),
    _p("petra_nova_ks", "CSLF/DOE 2016-2020 (vendor-reported)", "Petra Nova W.A. Parish",
       0.115, 0.90, "KS21", 2.6, (2.5, 2.7), {"published_solvent": "KS-1"},
       "Published solvent KS-1, modelled as KS21 (proxy); vendor-level figure."),
]


def plant_cases():
    cases = []
    for p in PLANT:
        inp = {**BASE, **solv(p["solvent"]), "y": p["y"], "eta": p["eta"]}
        model = compute(inp)["q_reb"] / 1e6
        cases.append(dict(id="plant_" + p["id"], note=p["plant"] + ": " + p["note"], kind="plant",
                          inputs=inp, ref=dict(q_reb=p["q_pub"] * 1e6), tol=TOL_PLANT,
                          source=p["source"], other=p["other"], q_range=list(p["q_range"])))
        print(f"plant {p['id']}: model q={model:.3f} pub={p['q_pub']} GJ/t dev={model / p['q_pub'] - 1:+.1%}")
    return cases


out = []
for cid, note, ov in CASES:
    inp = {**BASE, **ov}
    ref = compute(inp)
    out.append({"id": cid, "note": note, "inputs": inp, "ref": ref})
    ca = ref["cost_avoided"]
    print(f"{cid}: q_reb={ref['q_reb'] / 1e6:.4f} GJ/t aux={ref['e_aux'] / 3600:.2f} kWh/t "
          f"capex={ref['capex'] / 1e6:.1f} MEUR cap={ref['cost_captured']:.2f} "
          f"avd={'None' if ca is None else f'{ca:.2f}'} EUR/t "
          f"frac={ref['avoided_fraction']:.4f} trains={ref['absorber_trains']} "
          f"D={ref['absorber_D']:.2f} m")

out += plant_cases()

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "aminecapture_ref.json")
with open(path, "w") as f:
    json.dump(out, f, indent=2)
