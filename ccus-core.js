/* ccus-core.js — window.CCUS.core: CO2 properties (Span & Wagner 1996 EOS, coefficients from CoolProp 8 fluid JSON),
   saturation, PT/PH/PS flashes, viscosity (Laesecke & Muzny 2017), thermal conductivity (Huber et al. 2016),
   unit conversions and economics (CRF, NPV, IRR, payback, CO2 price path). SI units: Pa, K, kg/m3, J/kg, J/kg/K, Pa*s, W/m/K.
   Generated for tools.petrov.re CCUS package (campaign ccus-2026-10-19). Pure functions, no DOM. */
(function (root) {
'use strict';
var DATA = {"source":"CoolProp 8.0.0 fluid JSON CO2 (Span & Wagner 1996)","M":0.0440098,"Rmolar":8.31451,"R":188.92405782348476,"Tc":304.1282,"pc":7377300,"rhoc":467.60000128174005,"Tt":216.592,"pt":517964.34344772575,"Tmax":2000,"pmax":800000000,"alpha0":[{"a1":8.37304456,"a2":-3.70454304,"type":"IdealGasHelmholtzLead"},{"a":2.5,"type":"IdealGasHelmholtzLogTau"},{"n":[1.99427042,0.62105248,0.41195293,1.04028922,0.08327678],"t":[3.15163,6.1119,6.77708,11.32384,27.08792],"type":"IdealGasHelmholtzPlanckEinstein"},{"a1":-14.4979156224319,"a2":8.82013935801453,"reference":"IIR","type":"IdealGasHelmholtzEnthalpyEntropyOffset"}],"alphar":[{"d":[1,1,1,1,2,2,3,1,2,4,5,5,5,6,6,6,1,1,4,4,4,7,8,2,3,3,5,5,6,7,8,10,4,8],"l":[0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,3,3,3,4,4,4,4,4,4,5,6],"n":[0.388568232032,2.93854759427,-5.5867188535,-0.767531995925,0.317290055804,0.548033158978,0.122794112203,2.16589615432,1.58417351097,-0.231327054055,0.0581169164314,-0.553691372054,0.489466159094,-0.0242757398435,0.0624947905017,-0.121758602252,-0.370556852701,-0.0167758797004,-0.11960736638,-0.0456193625088,0.0356127892703,-0.00744277271321,-0.00173957049024,-0.0218101212895,0.0243321665592,-0.0374401334235,0.143387157569,-0.134919690833,-0.0231512250535,0.0123631254929,0.00210583219729,-0.000339585190264,0.00559936517716,-0.000303351180556],"t":[0,0.75,1,2,0.75,2,0.75,1.5,1.5,2.5,0,1.5,2,0,1,2,3,6,3,6,8,6,0,7,12,16,22,24,16,24,8,2,28,14],"type":"ResidualHelmholtzPower"},{"beta":[325,300,300,275,275],"d":[2,2,2,3,3],"epsilon":[1,1,1,1,1],"eta":[25,25,25,15,20],"gamma":[1.16,1.19,1.19,1.25,1.22],"n":[-213.654886883,26641.5691493,-24027.2122046,-283.41603424,212.472844002],"t":[1,0,1,3,3],"type":"ResidualHelmholtzGaussian"},{"A":[0.7,0.7,0.7],"B":[0.3,0.3,1],"C":[10,10,12.5],"D":[275,275,275],"a":[3.5,3.5,3],"b":[0.875,0.925,0.875],"beta":[0.3,0.3,0.3],"n":[-0.666422765408,0.726086323499,0.0550686686128],"type":"ResidualHelmholtzNonAnalytic"}],"anc":{"pS":{"T_r":304.1282,"Tmax":304.1281999999994,"Tmin":216.592,"description":"p' = pc*exp(Tc/T*sum(n_i*theta^t_i))","max_abserror_percentage":0.0010595686337877552,"n":[-5.867399337600407,-7.10969550015274,11.022781986239263,4.8260764050219995,-6.240803382557819,-6.7009642572439],"reducing_value":7377300.0,"t":[0.983,1.322,1.488,2.807,3.571,1.941],"type":"pL","using_tau_r":true},"rhoL":{"T_r":304.1282,"Tmax":304.1281999999994,"Tmin":216.592,"description":"rho' = rhoc*(1+sum(n_i*theta^t_i))","max_abserror_percentage":0.044231974273145624,"n":[0.861951794789174,5.535795098719573,-21.766373764605415,20.01416999278327,-2.2218647220786862,888.2387848519858],"reducing_value":10624.906299999999,"t":[0.264,0.672,0.986,1.092,1.714,9.902],"type":"rhoLnoexp","using_tau_r":false},"rhoV":{"T_r":304.1282,"Tmax":304.1281999999994,"Tmin":216.592,"description":"rho'' = rhoc*exp(Tc/T*sum(n_i*theta^t_i))","max_abserror_percentage":0.035329219540658485,"n":[-1.1635587811569494,-3.64216164754343,2.7773118075713237,-3.2573848494624533,-1.9739104682508852,-16.057319994659142],"reducing_value":10624.906299999999,"t":[0.306,0.569,0.677,0.891,3.206,6.093],"type":"rhoV","using_tau_r":true},"melting_line":{"BibTeX":"Span-JPCRD-1996","T_m":216.58,"parts":[{"T_0":216.592,"T_max":330,"T_min":216.592,"a":[1955.539,2055.4593],"p_0":517950,"t":[1,2]}],"type":"polynomial_in_Theta"}}};

function arPowGauss(g, delta, tau, r) {
  var i, n, d, t, l, e, f, u, v, ld, dd, tt;
  var gauss = g.type === 'ResidualHelmholtzGaussian';
  if (!gauss && g.type !== 'ResidualHelmholtzPower') return r;
  for (i = 0; i < g.n.length; i++) {
    n = g.n[i]; d = g.d[i]; t = g.t[i];
    f = n * Math.pow(delta, d) * Math.pow(tau, t);
    if (gauss) {
      dd = delta - g.epsilon[i]; tt = tau - g.gamma[i];
      f *= Math.exp(-g.eta[i] * dd * dd - g.beta[i] * tt * tt);
      u = d / delta - 2 * g.eta[i] * dd;
      v = t / tau - 2 * g.beta[i] * tt;
      r.a += f;
      r.d += f * u;
      r.dd += f * (u * u - d / (delta * delta) - 2 * g.eta[i]);
      r.t += f * v;
      r.tt += f * (v * v - t / (tau * tau) - 2 * g.beta[i]);
      r.dt += f * u * v;
    } else {
      l = g.l ? g.l[i] : 0;
      e = 0;
      if (l > 0) { ld = Math.pow(delta, l); f *= Math.exp(-ld); e = l * ld; }
      u = d - e;
      r.a += f;
      r.d += f * u / delta;
      r.dd += f * (u * (u - 1) - l * e) / (delta * delta);
      r.t += f * t / tau;
      r.tt += f * t * (t - 1) / (tau * tau);
      r.dt += f * u * t / (delta * tau);
    }
  }
  return r;
}

function arNonAnalytic(g, delta, tau, r) {
  var d = delta;
  if (Math.abs(d - 1) < 1e-10) d = 1 + 1e-10;
  var dm1 = d - 1, dm12 = dm1 * dm1, tm1 = tau - 1;
  var n = g.n, len = n.length;
  for (var i = 0; i < len; i++) {
    var ni = n[i], ai = g.a[i], bi = g.b[i], be = g.beta[i];
    var Ai = g.A[i], Bi = g.B[i], Ci = g.C[i], Di = g.D[i];
    var ib = 1 / (2 * be);
    var theta = (1 - tau) + Ai * Math.pow(dm12, ib);
    var Dl = theta * theta + Bi * Math.pow(dm12, ai);
    if (!(Dl > 0)) continue;
    var psi = Math.exp(-Ci * dm12 - Di * tm1 * tm1);
    if (!(psi > 0)) continue;
    // Delta derivatives
    var p1 = Math.pow(dm12, ib - 1);
    var dDd = dm1 * (Ai * theta * (2 / be) * p1 + 2 * Bi * ai * Math.pow(dm12, ai - 1));
    var dDdd = dDd / dm1 + dm12 * (
      4 * Bi * ai * (ai - 1) * Math.pow(dm12, ai - 2) +
      2 * Ai * Ai * (1 / (be * be)) * p1 * p1 +
      Ai * theta * (4 / be) * (ib - 1) * Math.pow(dm12, ib - 2));
    // Delta^b derivatives
    var Db = Math.pow(Dl, bi);
    var Db1 = Math.pow(Dl, bi - 1);
    var Db2 = Math.pow(Dl, bi - 2);
    var Dbd = bi * Db1 * dDd;
    var Dbdd = bi * (Db1 * dDdd + (bi - 1) * Db2 * dDd * dDd);
    var Dbt = -2 * theta * bi * Db1;
    var Dbtt = 2 * bi * Db1 + 4 * theta * theta * bi * (bi - 1) * Db2;
    var Dbdt = -Ai * bi * (2 / be) * Db1 * dm1 * p1 - 2 * theta * bi * (bi - 1) * Db2 * dDd;
    // psi derivatives
    var psd = -2 * Ci * dm1 * psi;
    var psdd = (2 * Ci * dm12 - 1) * 2 * Ci * psi;
    var pst = -2 * Di * tm1 * psi;
    var pstt = (2 * Di * tm1 * tm1 - 1) * 2 * Di * psi;
    var psdt = 4 * Ci * Di * dm1 * tm1 * psi;
    var q = psi + d * psd;
    var v, vd, vdd, vt, vtt, vdt;
    v = ni * Db * d * psi;
    vd = ni * (Db * q + Dbd * d * psi);
    vdd = ni * (Db * (2 * psd + d * psdd) + 2 * Dbd * q + Dbdd * d * psi);
    vt = ni * d * (Dbt * psi + Db * pst);
    vtt = ni * d * (Dbtt * psi + 2 * Dbt * pst + Db * pstt);
    vdt = ni * (Db * (pst + d * psdt) + d * Dbd * pst + Dbt * q + d * psi * Dbdt);
    if (isFinite(v) && isFinite(vd) && isFinite(vdd) &&
        isFinite(vt) && isFinite(vtt) && isFinite(vdt)) {
      r.a += v; r.d += vd; r.dd += vdd;
      r.t += vt; r.tt += vtt; r.dt += vdt;
    }
  }
  return r;
}

function alphar(D, delta, tau) {
  var r = { a: 0, d: 0, dd: 0, t: 0, tt: 0, dt: 0 };
  var G = D.alphar || [];
  for (var i = 0; i < G.length; i++) {
    var g = G[i];
    if (g.type === 'ResidualHelmholtzNonAnalytic') arNonAnalytic(g, delta, tau, r);
    else arPowGauss(g, delta, tau, r);
  }
  return r;
}

function alpha0(D, delta, tau) {
  var o = { a: 0, t: 0, tt: 0 };
  var G = D.alpha0 || [];
  for (var i = 0; i < G.length; i++) {
    var g = G[i];
    switch (g.type) {
      case 'IdealGasHelmholtzLead':
        o.a += Math.log(delta) + g.a1 + g.a2 * tau;
        o.t += g.a2;
        break;
      case 'IdealGasHelmholtzLogTau':
        o.a += g.a * Math.log(tau);
        o.t += g.a / tau;
        o.tt -= g.a / (tau * tau);
        break;
      case 'IdealGasHelmholtzPlanckEinstein':
        for (var k = 0; k < g.n.length; k++) {
          var n = g.n[k], th = g.t[k], e = Math.exp(-th * tau), om = 1 - e;
          o.a += n * Math.log(om);
          o.t += n * th * e / om;
          o.tt -= n * th * th * e / (om * om);
        }
        break;
      case 'IdealGasHelmholtzEnthalpyEntropyOffset':
        o.a += g.a1 + g.a2 * tau;
        o.t += g.a2;
        break;
    }
  }
  return o;
}

function stateRhoT(D, rho, T) {
  var R = D.R;
  var delta = rho / D.rhoc;
  var tau = D.Tc / T;
  var r = alphar(D, delta, tau);
  var o = alpha0(D, delta, tau);
  var RT = R * T;
  var p = rho * RT * (1 + delta * r.d);
  var u = RT * tau * (o.t + r.t);
  var h = u + RT * (1 + delta * r.d);
  var s = R * (tau * (o.t + r.t) - o.a - r.a);
  var cv = -R * tau * tau * (o.tt + r.tt);
  var dpdrho_T = RT * (1 + 2 * delta * r.d + delta * delta * r.dd);
  var dpdT_rho = rho * R * (1 + delta * r.d - delta * tau * r.dt);
  var cp = cv + T * dpdT_rho * dpdT_rho / (rho * rho * dpdrho_T);
  var w2 = dpdrho_T + T * dpdT_rho * dpdT_rho / (rho * rho * cv);
  var w = w2 >= 0 ? Math.sqrt(w2) : NaN;
  var Z = p / (rho * RT);
  var JT = (T * dpdT_rho / (rho * dpdrho_T) - 1) / (rho * cp);
  return { rho: rho, T: T, p: p, h: h, s: s, u: u, cv: cv, cp: cp, w: w, Z: Z, JT: JT,
    dpdrho_T: dpdrho_T, dpdT_rho: dpdT_rho };
}

function ancSat(D, T) {
  function sum(a, th) {
    var s = 0, i;
    for (i = 0; i < a.n.length; i++) s += a.n[i] * Math.pow(th, a.t[i]);
    return s;
  }
  function th(a) { var x = 1 - T / a.T_r; return x > 0 ? x : 0; }
  var pS = D.anc.pS, rL = D.anc.rhoL, rV = D.anc.rhoV;
  var Tr_L = rL.T_r || D.Tc, Tr_V = rV.T_r || D.Tc;
  var thL = Math.max(0, 1 - T / Tr_L), thV = Math.max(0, 1 - T / Tr_V);
  return {
    p: pS.reducing_value * Math.exp(pS.T_r / T * sum(pS, th(pS))),
    rhoL: rL.reducing_value * (1 + sum(rL, thL)) * D.M,
    rhoV: rV.reducing_value * Math.exp(Tr_V / T * sum(rV, thV)) * D.M
  };
}

function satT(D, T) {
  var tau = D.Tc / T, a, anc = ancSat(D, T);
  function build(rhoL, rhoV, approx) {
    var sL = stateRhoT(D, rhoL, T), sV = stateRhoT(D, rhoV, T);
    return {
      T: T, p: approx ? anc.p : sL.p, rhoL: rhoL, rhoV: rhoV,
      hL: sL.h, hV: sV.h, sL: sL.s, sV: sV.s, approx: approx
    };
  }
  function JK(dl) {
    var r = alphar(D, dl, tau);
    return {
      J: dl * (1 + dl * r.d),
      K: dl * r.d + r.a + Math.log(dl),
      Jd: 1 + 2 * dl * r.d + dl * dl * r.dd,
      Kd: 2 * r.d + dl * r.dd + 1 / dl
    };
  }
  if (T < D.Tt || T > D.Tc - 0.01) return build(anc.rhoL, anc.rhoV, true);

  var dL = anc.rhoL / D.rhoc, dV = anc.rhoV / D.rhoc, it, ok = false;
  for (it = 0; it < 50; it++) {
    var L = JK(dL), V = JK(dV);
    var f1 = V.J - L.J, f2 = V.K - L.K;
    var det = V.Jd * L.Kd - L.Jd * V.Kd;
    if (!isFinite(det) || det === 0) break;
    var sL = (f2 * V.Jd - f1 * V.Kd) / det;
    var sV = (f2 * L.Jd - f1 * L.Kd) / det;
    var g = 1, k, nL, nV;
    for (k = 0; k < 30; k++) {
      nL = dL + g * sL; nV = dV + g * sV;
      if (nL > 0 && nV > 0 && nL > nV) break;
      g *= 0.5;
    }
    if (k === 30) break;
    dL = nL; dV = nV;
    if ((Math.abs(f1) + Math.abs(f2) < 1e-12) ||
        (Math.abs(g * sL / dL) < 1e-12 && Math.abs(g * sV / dV) < 1e-12)) { ok = true; break; }
  }
  // reject trivial solution
  if (!ok || !isFinite(dL) || !isFinite(dV) || Math.abs(dL - dV) / dL < 1e-6)
    return build(anc.rhoL, anc.rhoV, true);
  return build(dL * D.rhoc, dV * D.rhoc, false);
}

function satP(D, p) {
  var Tlo = D.Tt, Thi = D.Tc, lp = Math.log(p), T, i, f;
  var pt = ancSat(D, Tlo).p;
  if (p <= pt) return satT(D, Tlo);
  if (p >= D.pc) return satT(D, D.Tc);
  var flo = Math.log(pt) - lp, fhi = Math.log(ancSat(D, Thi).p) - lp, side = 0;
  for (i = 0; i < 100; i++) {
    T = (Tlo * fhi - Thi * flo) / (fhi - flo);
    if (!(T > Tlo && T < Thi)) T = 0.5 * (Tlo + Thi);
    f = Math.log(ancSat(D, T).p) - lp;
    if (Math.abs(f) < 1e-13 || Thi - Tlo < 1e-12) break;
    if (f * fhi > 0) { Thi = T; fhi = f; if (side === 1) flo *= 0.5; side = 1; }
    else { Tlo = T; flo = f; if (side === -1) fhi *= 0.5; side = -1; }
  }
  var Tmax = D.Tc - 0.01, r0, r1, T0 = Math.min(T, Tmax), T1, f0, f1, Tn;
  r0 = satT(D, T0);
  if (r0.approx) return r0;
  f0 = r0.p / p - 1;
  if (Math.abs(f0) < 1e-10) return r0;
  T1 = T0 * (1 - 1e-4 * (f0 > 0 ? 1 : -1));
  if (T1 > Tmax) T1 = Tmax;
  if (T1 < D.Tt) T1 = D.Tt;
  for (i = 0; i < 30; i++) {
    r1 = satT(D, T1);
    if (r1.approx) return r0;
    f1 = r1.p / p - 1;
    if (Math.abs(f1) < 1e-10) return r1;
    if (f1 === f0) return r1;
    Tn = T1 - f1 * (T1 - T0) / (f1 - f0);
    if (Tn > Tmax) Tn = 0.5 * (T1 + Tmax);
    if (Tn < D.Tt) Tn = 0.5 * (T1 + D.Tt);
    T0 = T1; f0 = f1; r0 = r1; T1 = Tn;
  }
  return r1;
}

function rhoPT(D, p, T, s) {
  var R = D.R, lo, hi, rho, br, i, st, f, d, nr, k, best = NaN, bestF = Infinity;
  if (T < D.Tc) {
    s = s || satT(D, T);
    if (p >= s.p) { br = 'L'; lo = s.rhoL * 0.999; hi = 2000; rho = s.rhoL; }
    else { br = 'V'; lo = 1e-9; hi = s.rhoV * 1.001; rho = Math.min(s.rhoV, p / (R * T)); }
  } else {
    br = 'S'; lo = 1e-9; hi = 2000; rho = p / (R * T);
    if (p > D.pc) rho = Math.max(rho, 1.2 * D.rhoc);
  }
  for (k = 0; k < 60; k++) {
    st = stateRhoT(D, lo, T);
    if (st.p < p) break;
    if (br === 'L' && st.dpdrho_T > 0) lo *= 0.995; else { lo = 1e-9; break; }
  }
  for (k = 0; k < 60; k++) {
    st = stateRhoT(D, hi, T);
    if (st.p > p && st.dpdrho_T > 0) break;
    if (br === 'V') hi *= 1.005; else hi *= 1.25;
  }
  if (!(rho > lo && rho < hi)) rho = 0.5 * (lo + hi);
  for (i = 0; i < 100; i++) {
    st = stateRhoT(D, rho, T);
    f = st.p - p;
    d = st.dpdrho_T;
    if (Math.abs(f) < bestF && d > 0) { bestF = Math.abs(f); best = rho; }
    if (Math.abs(f) <= 1e-12 * Math.abs(p)) return rho;
    if (d > 0) { if (f < 0) lo = rho; else hi = rho; }
    else if (br === 'L') lo = rho;
    else if (br === 'V') hi = rho;
    else { if (f < 0) lo = rho; else hi = rho; }
    nr = (d > 0 && isFinite(d)) ? rho - f / d : NaN;
    if (!(nr > lo && nr < hi)) nr = 0.5 * (lo + hi);
    rho = nr;
    if (hi - lo <= 1e-14 * hi) break;
  }
  return isFinite(best) ? best : rho;
}

function props(D, p, T) {
  var s = null, rho, st, ph;
  if (T < D.Tc) s = satT(D, T);
  rho = rhoPT(D, p, T, s);
  st = stateRhoT(D, rho, T);
  if (T >= D.Tc) {
    ph = (p >= D.pc) ? 'supercritical' : 'gas';
  } else {
    ph = (p >= s.p || p > D.pc) ? 'liquid' : 'vapour';
    st.psat = s.p;
    st.satApprox = s.approx;
  }
  if (st.rho === undefined) st.rho = rho;
  st.phase = ph;
  return st;
}

function flashPX(D, p, val, key) {
  var lo = D.Tt, hi = 2000, sat, kL = key + 'L', kV = key + 'V';
  var tol = 1e-9 * Math.max(1, Math.abs(val));
  function f(T) { var st = props(D, p, T); st.f = st[key] - val; return st; }
  function done(st) { delete st.f; st.x = null; return st; }

  if (p > D.pt && p < D.pc) {
    sat = satP(D, p);
    if (val > sat[kL] && val < sat[kV]) {
      // two-phase mixture
      var x = (val - sat[kL]) / (sat[kV] - sat[kL]);
      var rho = 1 / ((1 - x) / sat.rhoL + x / sat.rhoV);
      var h = sat.hL + x * (sat.hV - sat.hL);
      return {
        phase: 'two-phase', p: p, T: sat.T, x: x, rho: rho, h: h,
        s: sat.sL + x * (sat.sV - sat.sL), u: h - p / rho,
        cp: NaN, cv: NaN, w: NaN, JT: NaN, dpdrho_T: NaN, dpdT_rho: NaN,
        Z: p / (rho * D.R * sat.T), psat: p
      };
    }
    // restrict bracket to the correct single-phase branch
    if (val <= sat[kL]) hi = sat.T - 1e-9; else lo = sat.T + 1e-9;
  }

  var sLo = f(lo), sHi = f(hi);
  if (Math.abs(sLo.f) < tol) return done(sLo);
  if (Math.abs(sHi.f) < tol) return done(sHi);
  if (sLo.f > 0 || sHi.f < 0) {
    throw new Error('flashP' + key.toUpperCase() + ': ' + key + '=' + val +
      ' outside achievable range [' + sLo[key] + ', ' + sHi[key] + '] at p=' + p);
  }

  // secant-like initial guess
  var T = lo - sLo.f * (hi - lo) / (sHi.f - sLo.f), st, d, Tn, i;
  if (!(T > lo && T < hi)) T = 0.5 * (lo + hi);

  for (i = 0; i < 100; i++) {
    st = f(T);
    if (Math.abs(st.f) < tol) return done(st);
    if (st.f < 0) lo = T; else hi = T;
    if (hi - lo < 1e-10) return done(st);
    d = key === 'h' ? st.cp : st.cp / T;
    Tn = T - st.f / d;
    // safeguard: fall back to bisection if Newton leaves the bracket
    if (!(d > 0) || !isFinite(Tn) || Tn <= lo || Tn >= hi) Tn = 0.5 * (lo + hi);
    T = Tn;
  }
  throw new Error('flashP' + key.toUpperCase() + ': no convergence at p=' + p + ', ' + key + '=' + val);
}

function flashPH(D, p, h) { return flashPX(D, p, h, 'h'); }

function flashPS(D, p, s) { return flashPX(D, p, s, 's'); }

function viscCO2(T, rho) {
  // T [K], rho [kg/m3] -> dynamic viscosity [Pa*s]; Laesecke & Muzny (2017), no critical enhancement
  var M = 0.0440098;      // molar mass [kg/mol]
  var NA = 6.02214076e23; // Avogadro [1/mol]
  var R = 8.31451;        // gas constant [J/(mol*K)]

  // 1) Dilute gas eta0(T), correlation gives mPa*s
  var a0 = 1749.354893188350, a1 = -369.069300007128, a2 = 5423856.34887691,
      a3 = -2.21283852168356, a4 = -269503.247933569, a5 = 73145.021531826,
      a6 = 5.34368649509278;
  var T13 = Math.pow(T, 1 / 3), T16 = Math.pow(T, 1 / 6), sT = Math.sqrt(T);
  var eta0 = 1.0055 * sT / (a0 + a1 * T16 + a2 * Math.exp(a3 * T13) +
             (a4 + a5 * T13) / Math.exp(T13) + a6 * sT); // [mPa*s]
  eta0 *= 1e-3;                                          // -> [Pa*s]

  // 2) Initial-density term (Rainwater-Friend)
  var epsk = 200.760;      // epsilon/k [K]
  var sigma = 0.378421e-9; // [m]
  var b = [-19.572881, 219.73999, -1015.3226, 2471.0125, -3375.1717,
           2491.6597, -787.26086, 14.085455, -0.34664158];
  var t = [0, -0.25, -0.5, -0.75, -1, -1.25, -1.5, -2.5, -5.5];
  var Ts = T / epsk, Bs = 0, i;
  for (i = 0; i < b.length; i++) { Bs += b[i] * Math.pow(Ts, t[i]); } // [-]
  var Beta = Bs * NA * sigma * sigma * sigma; // [m3/mol]
  var rhoMolar = rho / M;                     // [mol/m3]
  var eta1 = eta0 * Beta * rhoMolar;          // [Pa*s]

  // 3) Residual term
  var Ttp = 216.592;   // triple-point temperature [K]
  var rhoTL = 1178.53; // triple-point liquid density [kg/m3]
  var c1 = 0.360603235428487, c2 = 0.121550806591497, gam = 8.06282737481277;
  // Scaling viscosity: rho_tL as MASS density [kg/m3] with M^(1/6) in the denominator
  var etaTL = Math.pow(rhoTL, 2 / 3) * Math.sqrt(R * Ttp) /
              (Math.pow(M, 1 / 6) * Math.pow(NA, 1 / 3)); // [Pa*s]
  var Tr = T / Ttp, rr = rho / rhoTL;                     // [-]
  var dEta = etaTL * (c1 * Tr * rr * rr * rr +
             (rr * rr + Math.pow(rr, gam)) / (Tr - c2));  // [Pa*s]

  return eta0 + eta1 + dEta; // [Pa*s]
}

function condCO2(D, T, rho) {
  // Huber et al., JPCRD 45, 013102 (2016), CoolProp-consistent
  var Tc = D.Tc, rhoc = D.rhoc, pc = D.pc;          // K, kg/m3, Pa
  var Tr = T / Tc, dl = rho / rhoc, i;

  // 1) Dilute gas [mW/m/K] -> W/m/K
  var L = [1.51874307e-2, 2.80674040e-2, 2.28564190e-2, -7.41624210e-3];
  var den = 0;
  for (i = 0; i < 4; i++) den += L[i] / Math.pow(Tr, i);
  var lam0 = 1e-3 * Math.sqrt(Tr) / den;

  // 2) Residual [W/m/K]: sum (B1_i + B2_i*T/Tc)*(rho/rhoc)^i
  var B1 = [1.00128e-2, 5.60488e-2, -8.11620e-2, 6.24337e-2, -2.06336e-2, 2.53248e-3];
  var B2 = [4.30829e-3, -3.58563e-2, 6.71480e-2, -5.22855e-2, 1.74571e-2, -1.96414e-3];
  var lamr = 0;
  for (i = 0; i < 6; i++) lamr += (B1[i] + B2[i] * Tr) * Math.pow(dl, i + 1);

  // 3) Critical enhancement (simplified Olchowy-Sengers)
  var lamc = 0;
  if (rho > 0) {
    var kB = 1.380649e-23;   // J/K
    var R0 = 1.02, gam = 1.239, nu = 0.63, GAM = 0.052;
    var zeta0 = 1.5e-10;     // m
    var qD = 1 / 4.0e-10;    // 1/m
    var Tref = 456.19;       // K

    var s = stateRhoT(D, rho, T);
    var sRef = stateRhoT(D, rho, Tref);
    var chi = pc * rho / (rhoc * rhoc) / s.dpdrho_T;          // dimensionless
    var chiRef = pc * rho / (rhoc * rhoc) / sRef.dpdrho_T;
    var dchi = chi - chiRef * Tref / T;

    if (dchi > 0) {
      var zeta = zeta0 * Math.pow(dchi / GAM, nu / gam);      // m
      var y = qD * zeta;
      if (y >= 1e-12) {
        var cp = s.cp, cv = s.cv;                             // J/kg/K
        var eta = viscCO2(T, rho);                            // Pa*s
        var Om = 2 / Math.PI * ((cp - cv) / cp * Math.atan(y) + cv / cp * y);
        var rr = rhoc / rho;
        var Om0 = 2 / Math.PI *
          (1 - Math.exp(-1 / (1 / y + y * y / 3 * rr * rr)));
        // rho*cp (mass) == rho_molar*cp_molar -> W/m/K
        lamc = rho * cp * R0 * kB * T / (6 * Math.PI * eta * zeta) * (Om - Om0);
      }
    }
  }

  return lam0 + lamr + lamc;  // W/(m K)
}

var econ = {
  DEFAULT_PATH: [{y: 2025, v: 80}, {y: 2030, v: 145}, {y: 2040, v: 220}, {y: 2050, v: 300}],
  crf: function (i, n) {
    if (Math.abs(i) < 1e-12) return 1 / n;
    var a = Math.pow(1 + i, n);
    return i * a / (a - 1);
  },
  annualize: function (capex, i, n) { return capex * econ.crf(i, n); },
  npv: function (rate, cf) {
    var s = 0, d = 1 + rate, k;
    for (k = 0; k < cf.length; k++) s += cf[k] / Math.pow(d, k);
    return s;
  },
  irr: function (cf) {
    var f = function (r) { return econ.npv(r, cf); };
    var N = 200, lo = Math.log(0.01), hi = Math.log(11), best = null, bestD = Infinity;
    var rp = -0.99, fp = f(rp), r, fr, j, d;
    if (fp === 0) return rp;
    for (j = 1; j <= N; j++) {
      r = Math.exp(lo + (hi - lo) * j / N) - 1; fr = f(r);
      if (fr === 0) { d = Math.abs(r); if (d < bestD) { best = [r, r]; bestD = d; } }
      else if (isFinite(fp) && isFinite(fr) && fp * fr < 0) {
        d = (rp <= 0 && r >= 0) ? 0 : Math.min(Math.abs(rp), Math.abs(r));
        if (d < bestD) { best = [rp, r]; bestD = d; }
      }
      rp = r; fp = fr;
    }
    if (!best) return NaN;
    if (best[0] === best[1]) return best[0];
    var a = best[0], b = best[1], fa = f(a), fb = f(b), side = 0, c = a, fc, w = b - a, bis = false;
    for (j = 0; j < 300; j++) {
      c = bis ? 0.5 * (a + b) : (a * fb - b * fa) / (fb - fa);
      if (!(c > a && c < b)) c = 0.5 * (a + b);
      fc = f(c);
      if (fc === 0) return c;
      if (fc * fb > 0) { b = c; fb = fc; if (side === -1) fa /= 2; side = -1; }
      else { a = c; fa = fc; if (side === 1) fb /= 2; side = 1; }
      if (b - a < 1e-10) return 0.5 * (a + b);
      bis = (b - a) > 0.5 * w; w = b - a;
    }
    return c;
  },
  payback: function (cf, rate) {
    var r = rate || 0, cum = cf[0], prev, dk, k;
    if (cum >= 0) return 0;
    for (k = 1; k < cf.length; k++) {
      dk = cf[k] / Math.pow(1 + r, k);
      prev = cum; cum += dk;
      if (cum >= 0) return (k - 1) + (dk > 0 ? -prev / dk : 1);
    }
    return Infinity;
  },
  co2Price: function (year, path) {
    var p = path || econ.DEFAULT_PATH, n = p.length, k, t;
    if (year <= p[0].y) return p[0].v;
    if (year >= p[n - 1].y) return p[n - 1].v;
    for (k = 1; k < n; k++) {
      if (year <= p[k].y) {
        t = (year - p[k - 1].y) / (p[k].y - p[k - 1].y);
        return p[k - 1].v + t * (p[k].v - p[k - 1].v);
      }
    }
    return p[n - 1].v;
  },
  co2PricePath: function (y0, y1, path) {
    var out = [], y;
    for (y = y0; y <= y1; y++) out.push({year: y, price: econ.co2Price(y, path)});
    return out;
  },
  levelized: function (capex, opexPerYear, tonnesPerYear, i, n) {
    return (capex * econ.crf(i, n) + opexPerYear) / tonnesPerYear;
  }
};

var units = {
  p: {Pa: [1, 0], kPa: [1e3, 0], MPa: [1e6, 0], bar: [1e5, 0], barg: [1e5, 101325], psi: [6894.757293168, 0], psig: [6894.757293168, 101325], atm: [101325, 0]},
  T: {K: [1, 0], C: [1, 273.15], F: [5 / 9, 273.15 - 32 * 5 / 9]},
  rho: {'kg/m3': [1, 0], 'lb/ft3': [16.018463373960, 0]},
  h: {'J/kg': [1, 0], 'kJ/kg': [1e3, 0], 'Btu/lb': [2326, 0]},
  s: {'J/kg/K': [1, 0], 'kJ/kg/K': [1e3, 0]},
  mdot: {'kg/s': [1, 0], 't/h': [1000 / 3600, 0], 'Mt/y': [1e9 / (365.25 * 24 * 3600), 0], 'kt/y': [1e6 / (365.25 * 24 * 3600), 0], 't/d': [1000 / 86400, 0]},
  L: {m: [1, 0], km: [1e3, 0], mi: [1609.344, 0], nmi: [1852, 0], ft: [0.3048, 0]},
  D: {m: [1, 0], mm: [1e-3, 0], 'in': [0.0254, 0]},
  Q: {W: [1, 0], kW: [1e3, 0], MW: [1e6, 0]},
  E: {'J/kg': [1, 0], 'kJ/kg': [1e3, 0], 'kWh/t': [3600, 0], 'GJ/t': [1e6, 0]},
  mu: {'Pa s': [1, 0], 'mPa s': [1e-3, 0], 'uPa s': [1e-6, 0], cP: [1e-3, 0]},
  k: {'W/m/K': [1, 0], 'mW/m/K': [1e-3, 0]},
  w: {'m/s': [1, 0]},
  _table: function (q) {
    var t = Object.prototype.hasOwnProperty.call(units, q) ? units[q] : null;
    if (!t || typeof t !== 'object' || q.charAt(0) === '_') throw new Error('units: unknown quantity "' + q + '"');
    return t;
  },
  _entry: function (q, u) {
    var t = units._table(q);
    if (!Object.prototype.hasOwnProperty.call(t, u)) throw new Error('units: unknown unit "' + u + '" for quantity "' + q + '"');
    return t[u];
  },
  // SI = v*factor + offset (T offsets; gauge pressures -> absolute)
  toSI: function (q, v, u) { var e = units._entry(q, u); return v * e[0] + e[1]; },
  fromSI: function (q, v, u) { var e = units._entry(q, u); return (v - e[1]) / e[0]; },
  list: function (q) { return Object.keys(units._table(q)); }
};

// Validation helpers
function fin(v, name) {
  if (typeof v !== 'number' || !isFinite(v)) throw new RangeError(name + ' must be a finite number, got ' + v);
}
function checkP(p) {
  fin(p, 'p');
  if (!(p > 0 && p <= DATA.pmax)) throw new RangeError('p out of range (0, ' + DATA.pmax + '] Pa: ' + p);
}
function checkT(T) {
  fin(T, 'T');
  if (T < DATA.Tt - 1e-9 || T > DATA.Tmax) throw new RangeError('T out of range [' + DATA.Tt + ', ' + DATA.Tmax + '] K: ' + T);
}

// Single-phase transport enrichment; NaN inside the dome
function addTransport(st) {
  if (st.phase !== 'two-phase') {
    st.mu = viscCO2(st.T, st.rho);
    st.k = condCO2(DATA, st.T, st.rho);
    st.nu = st.mu / st.rho;
    st.Pr = st.mu * st.cp / st.k;
  } else {
    st.mu = st.k = st.nu = st.Pr = NaN;
  }
  return st;
}

// Saturation enrichment: per-phase cp, w, mu, k and latent heat
function enrichSat(s) {
  var L = stateRhoT(DATA, s.rhoL, s.T), V = stateRhoT(DATA, s.rhoV, s.T);
  s.cpL = L.cp; s.cpV = V.cp;
  s.wL = L.w; s.wV = V.w;
  s.muL = viscCO2(s.T, s.rhoL); s.muV = viscCO2(s.T, s.rhoV);
  s.kL = condCO2(DATA, s.T, s.rhoL); s.kV = condCO2(DATA, s.T, s.rhoV);
  s.dh = s.hV - s.hL;
  return s;
}

var core = {
  VERSION: '2026-10-19.1',
  consts: { Tc: DATA.Tc, pc: DATA.pc, rhoc: DATA.rhoc, Tt: DATA.Tt, pt: DATA.pt, M: DATA.M, R: DATA.R },

  state: function (rho, T) {
    fin(rho, 'rho'); fin(T, 'T');
    return addTransport(stateRhoT(DATA, rho, T));
  },
  props: function (p, T) {
    checkP(p); checkT(T);
    var r = addTransport(props(DATA, p, T));
    r.x = null;
    return r;
  },
  // Single-phase only; for two-phase use sat()/satP() per-phase values
  transport: function (T, rho) {
    fin(T, 'T'); fin(rho, 'rho');
    var mu = viscCO2(T, rho);
    return { mu: mu, k: condCO2(DATA, T, rho), nu: mu / rho };
  },
  sat: function (T) {
    fin(T, 'T');
    if (T < DATA.Tt - 1e-9 || T > DATA.Tc) throw new RangeError('T out of saturation range [' + DATA.Tt + ', ' + DATA.Tc + '] K: ' + T);
    return enrichSat(satT(DATA, T));
  },
  satP: function (p) {
    fin(p, 'p');
    if (p < DATA.pt || p > DATA.pc) throw new RangeError('p out of saturation range [' + DATA.pt + ', ' + DATA.pc + '] Pa: ' + p);
    return enrichSat(satP(DATA, p));
  },
  flashPH: function (p, h) {
    checkP(p); fin(h, 'h');
    return addTransport(flashPH(DATA, p, h));
  },
  flashPS: function (p, s) {
    checkP(p); fin(s, 's');
    return addTransport(flashPS(DATA, p, s));
  },
  // Cheap phase check without full property evaluation
  phaseOf: function (p, T) {
    checkP(p); checkT(T);
    if (T >= DATA.Tc) return p >= DATA.pc ? 'supercritical' : 'gas';
    return p >= satT(DATA, T).p ? 'liquid' : 'vapour';
  },
  econ: econ,
  units: units
};
core.flashPT = core.props; // alias

core._internal = { DATA: DATA, stateRhoT: stateRhoT, satT: satT, satP: satP, props: props, rhoPT: rhoPT,
  flashPH: flashPH, flashPS: flashPS, viscCO2: viscCO2, condCO2: condCO2, alphar: alphar, alpha0: alpha0 };
var CCUS = root.CCUS = root.CCUS || {};
CCUS.core = core;
if (typeof module !== 'undefined' && module.exports) module.exports = core;
})(typeof window !== 'undefined' ? window : globalThis);
