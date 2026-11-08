/* Jinovate tax engine — individual income tax (old vs new regime) and advance tax schedule.
   Rules per financial year are declared in RULES; everything else derives from them.
   Figures: Finance Acts 2023, 2024, 2025 and 2026 (Budget 2026 left personal slabs unchanged).
   Rounding follows s.288A/288B: total income to nearest ₹10, tax payable to nearest ₹10. */
(function (global) {
  'use strict';

  var RULES = {
    '2026-27': {
      ay: '2027-28', act: '2025',
      newSlabs: [[400000, 0], [800000, .05], [1200000, .10], [1600000, .15], [2000000, .20], [2400000, .25], [Infinity, .30]],
      newRebateLimit: 1200000, newRebateMax: 60000, newStd: 75000, newFamilyPension: 25000, newEmployerNps: .14,
      oldStd: 50000, oldFamilyPension: 15000, oldEmployerNps: .10,
      dates: ['2026-06-15', '2026-09-15', '2026-12-15', '2027-03-15'], fyEnd: '2027-03-31'
    },
    '2025-26': {
      ay: '2026-27', act: '1961',
      newSlabs: [[400000, 0], [800000, .05], [1200000, .10], [1600000, .15], [2000000, .20], [2400000, .25], [Infinity, .30]],
      newRebateLimit: 1200000, newRebateMax: 60000, newStd: 75000, newFamilyPension: 25000, newEmployerNps: .14,
      oldStd: 50000, oldFamilyPension: 15000, oldEmployerNps: .10,
      dates: ['2025-06-15', '2025-09-15', '2025-12-15', '2026-03-15'], fyEnd: '2026-03-31'
    },
    '2024-25': {
      ay: '2025-26', act: '1961',
      newSlabs: [[300000, 0], [700000, .05], [1000000, .10], [1200000, .15], [1500000, .20], [Infinity, .30]],
      newRebateLimit: 700000, newRebateMax: 25000, newStd: 75000, newFamilyPension: 25000, newEmployerNps: .14,
      oldStd: 50000, oldFamilyPension: 15000, oldEmployerNps: .10,
      dates: ['2024-06-15', '2024-09-15', '2024-12-15', '2025-03-15'], fyEnd: '2025-03-31'
    },
    '2023-24': {
      ay: '2024-25', act: '1961',
      newSlabs: [[300000, 0], [600000, .05], [900000, .10], [1200000, .15], [1500000, .20], [Infinity, .30]],
      newRebateLimit: 700000, newRebateMax: 25000, newStd: 50000, newFamilyPension: 15000, newEmployerNps: .10,
      oldStd: 50000, oldFamilyPension: 15000, oldEmployerNps: .10,
      dates: ['2023-06-15', '2023-09-15', '2023-12-15', '2024-03-15'], fyEnd: '2024-03-31'
    }
  };
  var FY_ORDER = ['2026-27', '2025-26', '2024-25', '2023-24'];

  var OLD_REBATE_LIMIT = 500000, OLD_REBATE_MAX = 12500;
  var SURCHARGE = [[5000000, .10], [10000000, .15], [20000000, .25], [50000000, .37]]; // threshold, rate above it
  var NEW_SURCHARGE_CAP = .25;
  var CESS = .04;

  function n(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function round10(v) { return Math.round(v / 10) * 10; }
  function floor100(v) { return Math.floor(v / 100) * 100; }

  function oldBasicExemption(age, resident) {
    if (!resident) return 250000;
    if (age === '80') return 500000;
    if (age === '60') return 300000;
    return 250000;
  }

  function oldSlabs(age, resident) {
    var be = oldBasicExemption(age, resident);
    var s = [[be, 0]];
    if (be < 500000) s.push([500000, .05]);
    s.push([1000000, .20], [Infinity, .30]);
    return s;
  }

  // Slab tax with a row-wise breakdown.
  function slabTax(income, slabs) {
    var rows = [], prev = 0, total = 0;
    for (var i = 0; i < slabs.length; i++) {
      var upto = slabs[i][0], rate = slabs[i][1];
      if (income <= prev) break;
      var amt = Math.min(income, upto) - prev;
      var tax = amt * rate;
      rows.push({ from: prev, to: upto, rate: rate, amount: amt, tax: tax });
      total += tax;
      prev = upto;
    }
    return { total: total, rows: rows };
  }

  function surchargeFor(income, baseTax, regime, slabs) {
    var rate = 0, threshold = 0, lowerRate = 0;
    for (var i = 0; i < SURCHARGE.length; i++) {
      if (income > SURCHARGE[i][0]) { lowerRate = rate; rate = SURCHARGE[i][1]; threshold = SURCHARGE[i][0]; }
    }
    if (regime === 'new' && rate > NEW_SURCHARGE_CAP) { rate = NEW_SURCHARGE_CAP; }
    if (!rate) return { surcharge: 0, rate: 0, relief: 0 };
    var sur = baseTax * rate;
    // Marginal relief: tax + surcharge may not exceed (tax + surcharge at the threshold) + (income − threshold).
    var taxAtThreshold = slabTax(threshold, slabs).total;
    var lr = lowerRate; if (regime === 'new' && lr > NEW_SURCHARGE_CAP) lr = NEW_SURCHARGE_CAP;
    var capTotal = taxAtThreshold * (1 + lr) + (income - threshold);
    var relief = 0;
    if (baseTax + sur > capTotal) { relief = (baseTax + sur) - capTotal; sur = Math.max(0, sur - relief); }
    return { surcharge: sur, rate: rate, relief: relief };
  }

  /**
   * computeRegime(fy, regime, inputs) → detailed breakdown.
   * inputs: { age:'<60'|'60'|'80', resident:bool, salary, exemptAllowances, employerNps,
   *           hpType:'none'|'self'|'letout', rent, municipalTax, homeLoanInterest,
   *           business, otherIncome, savingsInterest, familyPension,
   *           ded80c, ded80ccd1b, ded80d, ded80e, ded80g, dedOther }
   */
  function computeRegime(fy, regime, inp) {
    var R = RULES[fy]; if (!R) throw new Error('Unknown FY ' + fy);
    var isNew = regime === 'new';
    var age = inp.age || '<60', resident = inp.resident !== false;
    var lines = []; // [label, amount, note]

    // 1. Salary
    var salary = n(inp.salary);
    var exemptAllow = isNew ? 0 : Math.min(n(inp.exemptAllowances), salary);
    var std = salary > 0 ? Math.min(isNew ? R.newStd : R.oldStd, salary - exemptAllow) : 0;
    var salaryNet = Math.max(0, salary - exemptAllow - std);
    if (salary > 0) {
      lines.push(['Gross salary', salary]);
      if (exemptAllow) lines.push(['Less: HRA and other exempt allowances', -exemptAllow]);
      lines.push(['Less: standard deduction', -std]);
    }

    // 2. House property
    var hp = 0, hpNote = '';
    var interest = n(inp.homeLoanInterest);
    if (inp.hpType === 'letout') {
      var nav = Math.max(0, n(inp.rent) - n(inp.municipalTax));
      hp = nav - nav * .30 - interest;
      if (hp < 0) {
        if (isNew) { hpNote = 'Loss of ' + fmt(-hp) + ' cannot be set off against other income in the new regime.'; hp = 0; }
        else if (hp < -200000) { hpNote = 'Loss limited to ₹2,00,000 for set-off; ' + fmt(-hp - 200000) + ' carried forward.'; hp = -200000; }
      }
    } else if (inp.hpType === 'self') {
      if (isNew) { hp = 0; if (interest) hpNote = 'Interest on a self-occupied home is not deductible in the new regime.'; }
      else { hp = -Math.min(interest, 200000); if (interest > 200000) hpNote = 'Interest capped at ₹2,00,000 for a self-occupied house.'; }
    }
    if (inp.hpType && inp.hpType !== 'none') lines.push(['Income from house property', hp, hpNote]);

    // 3. Business / profession
    var business = n(inp.business);
    if (business) lines.push(['Business or professional income', business]);

    // 4. Other sources
    var savings = n(inp.savingsInterest), other = n(inp.otherIncome), famPension = n(inp.familyPension);
    var famDed = famPension ? Math.min(isNew ? R.newFamilyPension : R.oldFamilyPension, famPension / 3) : 0;
    var otherTotal = savings + other + famPension - famDed;
    if (otherTotal || famPension) lines.push(['Income from other sources', otherTotal, famDed ? 'After family pension deduction of ' + fmt(famDed) : '']);

    var gti = salaryNet + hp + business + otherTotal;
    if (gti < 0) gti = 0;

    // 5. Chapter VI-A
    var ded = [];
    var employerNps = n(inp.employerNps);
    if (employerNps) {
      var npsCap = salary * (isNew ? R.newEmployerNps : R.oldEmployerNps);
      var npsAllowed = Math.min(employerNps, npsCap);
      ded.push(['Employer NPS contribution (80CCD(2))', npsAllowed, employerNps > npsAllowed ? 'Capped at ' + (isNew ? '14%' : '10%') + ' of salary' : '']);
    }
    if (!isNew) {
      var c = Math.min(n(inp.ded80c), 150000); if (c) ded.push(['80C (PF, PPF, ELSS, LIC, tuition, principal)', c, n(inp.ded80c) > 150000 ? 'Capped at ₹1,50,000' : '']);
      var c1b = Math.min(n(inp.ded80ccd1b), 50000); if (c1b) ded.push(['80CCD(1B) NPS', c1b, n(inp.ded80ccd1b) > 50000 ? 'Capped at ₹50,000' : '']);
      var dcap = age === '<60' ? 75000 : 100000; var d = Math.min(n(inp.ded80d), dcap); if (d) ded.push(['80D health insurance', d, n(inp.ded80d) > dcap ? 'Capped at ' + fmt(dcap) : '']);
      var e = n(inp.ded80e); if (e) ded.push(['80E education loan interest', e]);
      var g = n(inp.ded80g); if (g) ded.push(['80G donations (eligible amount)', g]);
      if (savings) {
        var tta = age === '<60' ? Math.min(savings, 10000) : Math.min(savings, 50000);
        if (!resident && age !== '<60') tta = Math.min(savings, 10000);
        ded.push([age === '<60' || !resident ? '80TTA savings interest' : '80TTB interest (senior citizen)', tta]);
      }
      var o = n(inp.dedOther); if (o) ded.push(['Other deductions (80DD, 80U, 80GG, etc.)', o]);
    }
    var dedTotal = 0; for (var i = 0; i < ded.length; i++) dedTotal += ded[i][1];
    dedTotal = Math.min(dedTotal, gti);

    var taxable = round10(Math.max(0, gti - dedTotal));

    // 6. Tax on slabs
    var slabs = isNew ? R.newSlabs : oldSlabs(age, resident);
    var st = slabTax(taxable, slabs);
    var tax = st.total;

    // 7. Rebate 87A (residents only)
    var rebate = 0, marginal = 0;
    if (resident) {
      if (isNew) {
        if (taxable <= R.newRebateLimit) rebate = Math.min(tax, R.newRebateMax);
        else if (tax > taxable - R.newRebateLimit) { marginal = tax - (taxable - R.newRebateLimit); }
      } else if (taxable <= OLD_REBATE_LIMIT) rebate = Math.min(tax, OLD_REBATE_MAX);
    }
    var afterRebate = tax - rebate - marginal;

    // 8. Surcharge and cess
    var sc = surchargeFor(taxable, afterRebate, regime, slabs);
    var cess = (afterRebate + sc.surcharge) * CESS;
    var total = round10(afterRebate + sc.surcharge + cess);

    return {
      fy: fy, ay: R.ay, regime: regime, act: R.act,
      lines: lines, grossTotalIncome: gti, deductions: ded, deductionTotal: dedTotal,
      taxableIncome: taxable, slabRows: st.rows, slabTax: tax,
      rebate: rebate, marginalRelief: marginal, taxAfterRebate: afterRebate,
      surcharge: sc.surcharge, surchargeRate: sc.rate, surchargeRelief: sc.relief,
      cess: cess, total: total,
      effectiveRate: gti > 0 ? total / gti : 0,
      monthly: total / 12,
      stdDeduction: std
    };
  }

  function compare(fy, inp) {
    var a = computeRegime(fy, 'new', inp), b = computeRegime(fy, 'old', inp);
    var better = a.total <= b.total ? 'new' : 'old';
    return { 'new': a, old: b, better: better, saving: Math.abs(a.total - b.total) };
  }

  /**
   * advanceSchedule(fy, totalTax, tds, paid[4], opts) → schedule rows + interest.
   * opts: { presumptive:bool, seniorNoBusiness:bool, today:Date }
   */
  function advanceSchedule(fy, totalTax, tds, paid, opts) {
    var R = RULES[fy]; opts = opts || {};
    var today = opts.today || new Date();
    var net = Math.max(0, round10(n(totalTax) - n(tds)));
    var required = net >= 10000 && !opts.seniorNoBusiness;
    var pct = opts.presumptive ? [0, 0, 0, 1] : [.15, .45, .75, 1];
    var safe = opts.presumptive ? [0, 0, 0, 1] : [.12, .36, .75, 1];
    var months = [3, 3, 3, 1];
    var labels = opts.presumptive ? ['', '', '', 'Single instalment (presumptive, s.44AD/44ADA)'] : ['1st instalment', '2nd instalment', '3rd instalment', '4th instalment'];
    var rows = [], cumPaid = 0, interestTotal = 0, nextMarked = false;
    for (var i = 0; i < 4; i++) {
      if (opts.presumptive && i < 3) continue;
      var due = new Date(R.dates[i] + 'T23:59:59');
      cumPaid += n(paid[i]);
      var cumDue = Math.round(net * pct[i]);
      var shortfall = Math.max(0, cumDue - cumPaid);
      var passed = today > due;
      var status;
      if (!required) status = 'na';
      else if (passed) status = shortfall > 0 ? 'short' : 'paid';
      else if (!nextMarked) { status = 'next'; nextMarked = true; }
      else status = 'upcoming';
      var interest = 0;
      if (required && passed && shortfall > 0) {
        var safeOk = i < 2 && cumPaid >= net * safe[i];
        if (!safeOk) interest = floor100(shortfall) * .01 * months[i];
      }
      interestTotal += interest;
      rows.push({ label: labels[i], date: R.dates[i], cumPct: pct[i], cumDue: cumDue, instalment: cumDue - (i > 0 ? Math.round(net * pct[i - 1]) : 0), cumPaid: cumPaid, payNow: shortfall, status: status, interest: interest, months: months[i] });
    }
    var b90 = net * .9, paidTotal = cumPaid;
    return { net: net, required: required, rows: rows, interest234C: interestTotal, paidTotal: paidTotal, below90: required && paidTotal < b90, shortfall90: Math.max(0, b90 - paidTotal), perMonth234B: floor100(Math.max(0, net - paidTotal)) * .01, fyEnd: R.fyEnd, act: R.act };
  }

  // Indian grouping: 12,34,567
  function fmt(v, opts) {
    opts = opts || {};
    var neg = v < 0; v = Math.abs(Math.round(v));
    var s = String(v), last3 = s.slice(-3), rest = s.slice(0, -3);
    if (rest) last3 = ',' + last3;
    rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    var out = (opts.noSymbol ? '' : '₹') + rest + last3;
    return neg ? '−' + out : out;
  }
  function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }
  function fmtDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear();
  }
  function defaultFY(today) {
    today = today || new Date();
    var y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    var key = y + '-' + String((y + 1) % 100).padStart(2, '0');
    return RULES[key] ? key : FY_ORDER[0];
  }

  global.JTax = { RULES: RULES, FY_ORDER: FY_ORDER, computeRegime: computeRegime, compare: compare, advanceSchedule: advanceSchedule, fmt: fmt, pct: pct, fmtDate: fmtDate, defaultFY: defaultFY, round10: round10 };
})(window);
