(function () {
  'use strict';

  var form = document.getElementById('calculator-form');
  var clearBtn = document.getElementById('clear-all');
  var helpToggle = document.getElementById('help-toggle');
  var helpContent = document.getElementById('help-content');
  var facilityTypeFully = document.getElementById('facility-type-fully');
  var facilityTypeProgress = document.getElementById('facility-type-progress');
  var progressiveOptions = document.getElementById('progressive-draw-options');
  var resultsSection = document.getElementById('results-section');
  var facilitySizeEl = document.getElementById('facility-size');
  var totalInterestEl = document.getElementById('total-interest');
  var facilityFeeResultEl = document.getElementById('facility-fee-result');
  var totalCostEl = document.getElementById('total-cost');
  var finalBalanceEl = document.getElementById('final-balance');
  var effectiveRateEl = document.getElementById('effective-rate');
  var progressiveSummaryEl = document.getElementById('progressive-summary');
  var monthlyTbody = document.getElementById('monthly-tbody');
  var yearlyTbody = document.getElementById('yearly-tbody');
  var tabMonthly = document.getElementById('tab-monthly');
  var tabYearly = document.getElementById('tab-yearly');
  var panelMonthly = document.getElementById('panel-monthly');
  var panelYearly = document.getElementById('panel-yearly');
  var calculationTitleEl = document.getElementById('calculation-title');
  var breakdownLegendEl = document.getElementById('breakdown-legend');
  var breakdownLegendDrawLabel = document.getElementById('breakdown-legend-draw-label');
  var breakdownLegendTailLabel = document.getElementById('breakdown-legend-tail-label');

  function parseNum(val) {
    if (val == null || val === '') return NaN;
    var s = String(val).replace(/[,\s]/g, '');
    return parseFloat(s, 10);
  }

  function formatCurrency(num) {
    if (num !== num) return '–';
    return '$' + Number(num).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPercent(num) {
    if (num !== num) return '–';
    return Number(num).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  function formatPrincipalForDisplay(num) {
    if (num !== num || num === 0) return '';
    return Number(num).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function maskPrincipalInput() {
    var input = form.principal;
    if (!input) return;
    var raw = input.value.replace(/[^\d.]/g, '');
    var parts = raw.split('.');
    if (parts.length > 2) parts = [parts[0], parts.slice(1).join('')];
    var num = parseFloat(parts[0] + (parts[1] !== undefined ? '.' + parts[1] : ''), 10);
    if (raw === '') {
      input.value = '';
      return;
    }
    if (!isNaN(num) && num >= 0) {
      input.value = formatPrincipalForDisplay(num);
    }
  }

  /**
   * One row per calendar month. Interest applies only at compound months (e.g. monthly = every month; quarterly = 3,6,9,12).
   * rateDecimal = nominal annual rate as decimal; n = compounds per year; termMonths = length in months.
   */
  function buildMonthlyRows(termMonths, n, principal, rateDecimal) {
    var rows = [];
    var ratePerPeriod = rateDecimal / n;
    var monthsPerCompound = 12 / n;
    var balance = principal;

    for (var m = 1; m <= termMonths; m++) {
      var opening = balance;
      var interest = (m % monthsPerCompound === 0) ? balance * ratePerPeriod : 0;
      balance = opening + interest;
      rows.push({
        period: m,
        openingBalance: opening,
        interest: interest,
        closingBalance: balance
      });
    }
    return rows;
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  /**
   * Mercer funding: establishment fee is drawn at settlement so opening balance = net + establishmentFee.
   * Draw: 55% utilisation, interest capitalised monthly. Tail: 100% utilisation (full drawn net + fee + cap interest).
   * Pass establishmentFee (caller iterates when fee rate > 0 to solve for fee). Returns totalInterest and rows.
   */
  function calculateMercerFunding(netAmount, annualRate, buildMonths, totalTerm, utilisationPct, establishmentFee) {
    var monthlyRate = annualRate / 12;
    var utilisationDecimal = utilisationPct / 100;

    // Opening balance at settlement = net + establishment fee (fee is drawn at settlement)
    var simulationBalance = netAmount + establishmentFee;
    var totalInterest = 0;
    var rows = [];

    for (var m = 1; m <= totalTerm; m++) {
      var utilization = (m <= buildMonths) ? utilisationDecimal : 1.0;
      var openingBalance = simulationBalance;
      var interestThisMonth = simulationBalance * utilization * monthlyRate;
      totalInterest += interestThisMonth;
      simulationBalance += interestThisMonth;
      rows.push({
        period: m,
        openingBalance: openingBalance,
        interest: interestThisMonth,
        closingBalance: simulationBalance
      });
    }

    var acc = 0;
    for (var i = 0; i < rows.length; i++) {
      acc += rows[i].interest;
      rows[i].accruedInterest = acc;
    }

    return {
      totalInterest: totalInterest,
      monthlyRows: rows,
      finalBalance: simulationBalance
    };
  }

  /**
   * Progressive draw when no facility fee: balance = net, utilisation during draw, capitalise at selected frequency (n).
   */
  function buildMonthlyRowsProgressive(netRequired, fee, drawMonths, tailMonths, rateDecimal, utilisationPct, n) {
    var rows = [];
    var ratePerPeriod = rateDecimal / n;
    var monthsPerCompound = 12 / n;
    var drawBalance = round2(netRequired * (utilisationPct / 100) + fee);
    var drawInterestAccrued = 0;

    for (var m = 1; m <= drawMonths; m++) {
      var interest = (m % monthsPerCompound === 0) ? Math.round(drawBalance * ratePerPeriod) : 0;
      drawInterestAccrued += interest;
      rows.push({
        period: m,
        openingBalance: drawBalance,
        interest: interest,
        closingBalance: drawBalance
      });
    }

    var tailStartBalance = Math.round(netRequired + fee + drawInterestAccrued);
    var balance = tailStartBalance;
    for (var t = 1; t <= tailMonths; t++) {
      var m = drawMonths + t;
      var opening = balance;
      var interest = (m % monthsPerCompound === 0) ? Math.round(balance * ratePerPeriod) : 0;
      balance = opening + interest;
      rows.push({
        period: m,
        openingBalance: opening,
        interest: interest,
        closingBalance: balance
      });
    }

    var acc = 0;
    for (var i = 0; i < rows.length; i++) {
      acc += rows[i].interest;
      rows[i].accruedInterest = acc;
    }

    return rows;
  }

  /** Compute interest and rows for progressive draw with given net and fee (used when fee is 0 or for non–gross-up path). */
  function computeInterestProgressive(netRequired, fee, drawMonths, tailMonths, rateDecimal, utilisationPct, n) {
    var rows = buildMonthlyRowsProgressive(netRequired, fee, drawMonths, tailMonths, rateDecimal, utilisationPct, n);
    var totalInterest = 0;
    rows.forEach(function (r) { totalInterest += r.interest; });
    var finalBalance = rows.length ? rows[rows.length - 1].closingBalance : netRequired + fee;
    return { totalInterest: totalInterest, monthlyRows: rows, finalBalance: finalBalance };
  }

  /** Fully drawn: starting balance = net + fee at settlement. Interest capitalises at selected frequency (n). */
  function buildMonthlyRowsFullyDrawn(netRequired, fee, termMonths, rateDecimal, n) {
    var rows = [];
    var ratePerPeriod = rateDecimal / n;
    var monthsPerCompound = 12 / n;
    var balance = netRequired + fee;
    for (var m = 1; m <= termMonths; m++) {
      var opening = balance;
      var interest = (m % monthsPerCompound === 0) ? balance * ratePerPeriod : 0;
      balance = opening + interest;
      rows.push({
        period: m,
        openingBalance: opening,
        interest: interest,
        closingBalance: balance
      });
    }
    var acc = 0;
    for (var i = 0; i < rows.length; i++) {
      acc += rows[i].interest;
      rows[i].accruedInterest = acc;
    }
    return rows;
  }

  /** Aggregate monthly rows into one row per year. */
  function buildYearlyRows(monthlyRows) {
    var yearly = [];
    var year = 1;
    var openBal = monthlyRows.length > 0 ? monthlyRows[0].openingBalance : 0;
    var interestSum = 0;
    var accruedSoFar = 0;

    for (var i = 0; i < monthlyRows.length; i++) {
      var row = monthlyRows[i];
      interestSum += row.interest;
      if (row.period % 12 === 0 || i === monthlyRows.length - 1) {
        accruedSoFar += interestSum;
        yearly.push({
          year: year,
          openingBalance: openBal,
          interest: interestSum,
          accruedInterest: accruedSoFar,
          closingBalance: row.closingBalance
        });
        openBal = row.closingBalance;
        interestSum = 0;
        year++;
      }
    }
    return yearly;
  }

  function runCalculation() {
    var netRequired = parseNum(form.principal.value);
    var ratePct = parseNum(form.rate.value);
    var n = parseInt(form.frequency.value, 10);
    var termMonths = parseInt(form.term.value, 10);
    var facilityFeePct = parseNum(form['facility-fee'].value);
    var isProgressive = facilityTypeProgress.checked;
    var drawMonths = parseInt(form['construction-period'].value, 10);
    var utilisationPct = parseNum(form.utilisation.value);

    if (netRequired !== netRequired || netRequired <= 0) {
      return { valid: false, message: 'Enter a valid amount required (net).' };
    }
    if (ratePct !== ratePct || ratePct < 0) {
      return { valid: false, message: 'Enter a valid interest rate.' };
    }
    if (termMonths !== termMonths || termMonths < 1) {
      return { valid: false, message: 'Enter a valid facility term in months.' };
    }

    if (isProgressive) {
      if (drawMonths !== drawMonths || drawMonths < 1) {
        return { valid: false, message: 'Enter a valid construction period.' };
      }
      if (drawMonths > termMonths) {
        return { valid: false, message: 'Construction period must be less than or equal to facility term.' };
      }
      if (utilisationPct !== utilisationPct || utilisationPct < 1 || utilisationPct > 100) {
        return { valid: false, message: 'Utilisation during draw must be between 1 and 100.' };
      }
    }

    if (facilityFeePct !== facilityFeePct || facilityFeePct < 0) facilityFeePct = 0;
    var rateDecimal = ratePct / 100;
    var facilitySize = netRequired;
    var monthlyRows;
    var totalInterest = 0;
    var finalBalance = netRequired;
    var progressiveSummary = null;
    var tailMonths = isProgressive ? termMonths - drawMonths : 0;

    if (isProgressive) {
      var establishmentFee = facilityFeePct > 0 ? netRequired * (facilityFeePct / 100) : 0;
      var factor = 1 - facilityFeePct / 100;
      for (var iter = 0; iter < 50; iter++) {
        var ref = calculateMercerFunding(netRequired, rateDecimal, drawMonths, termMonths, utilisationPct, establishmentFee);
        monthlyRows = ref.monthlyRows;
        totalInterest = ref.totalInterest;
        finalBalance = ref.finalBalance;
        if (facilityFeePct <= 0) break;
        facilitySize = (netRequired + totalInterest) / factor;
        var establishmentFeeNew = facilitySize * (facilityFeePct / 100);
        if (Math.abs(establishmentFeeNew - establishmentFee) < 0.01) break;
        establishmentFee = establishmentFeeNew;
      }
      if (facilityFeePct <= 0) facilitySize = netRequired + totalInterest;
      else facilitySize = (netRequired + totalInterest) / factor;
      progressiveSummary = 'Draw: ' + drawMonths + ' months at ' + utilisationPct + '% utilisation; tail: ' + tailMonths + ' months at 100%.';
    } else if (facilityFeePct > 0) {
      var factor = 1 - facilityFeePct / 100;
      for (var iter = 0; iter < 50; iter++) {
        var fee = Math.round(facilitySize * (facilityFeePct / 100));
        monthlyRows = buildMonthlyRowsFullyDrawn(netRequired, fee, termMonths, rateDecimal, n);
        totalInterest = 0;
        monthlyRows.forEach(function (r) {
          totalInterest += r.interest;
          finalBalance = r.closingBalance;
        });
        var newF = Math.round((netRequired + totalInterest) / factor);
        if (newF === facilitySize) {
          facilitySize = newF;
          break;
        }
        facilitySize = newF;
      }
    } else {
      facilitySize = netRequired;
      var fee = 0;
      monthlyRows = buildMonthlyRowsFullyDrawn(netRequired, fee, termMonths, rateDecimal, n);
      totalInterest = 0;
      monthlyRows.forEach(function (r) {
        totalInterest += r.interest;
        finalBalance = r.closingBalance;
      });
    }

    if (isProgressive && !progressiveSummary) {
      progressiveSummary = 'Draw: ' + drawMonths + ' months at ' + utilisationPct + '% utilisation; tail: ' + tailMonths + ' months at 100%.';
    }

    var yearlyRows = buildYearlyRows(monthlyRows);
    var facilityFee = facilityFeePct > 0 ? facilitySize * (facilityFeePct / 100) : 0;
    var totalCost = totalInterest + facilityFee;
    var effectiveRate;
    if ((facilityFee > 0 || isProgressive) && netRequired > 0 && termMonths > 0) {
      // All-in effective annual rate: reflects actual total cost (and utilisation for progressive draws), annualised over term
      effectiveRate = (Math.pow(1 + totalCost / netRequired, 12 / termMonths) - 1) * 100;
    } else {
      // Interest-only effective annual rate (nominal rate compounded, fully drawn)
      effectiveRate = (Math.pow(1 + rateDecimal / n, n) - 1) * 100;
    }

    return {
      valid: true,
      facilitySize: facilitySize,
      monthlyRows: monthlyRows,
      yearlyRows: yearlyRows,
      totalInterest: totalInterest,
      facilityFee: facilityFee,
      totalCost: totalCost,
      finalBalance: finalBalance,
      effectiveRate: effectiveRate,
      progressiveSummary: progressiveSummary,
      isProgressive: isProgressive,
      drawMonths: isProgressive ? drawMonths : null,
      utilisationPct: isProgressive ? utilisationPct : null
    };
  }

  function renderTables(data) {
    var isProgressive = data.isProgressive && data.drawMonths != null;
    monthlyTbody.innerHTML = '';
    data.monthlyRows.forEach(function (row) {
      var tr = document.createElement('tr');
      if (isProgressive) {
        tr.classList.add(row.period <= data.drawMonths ? 'phase-draw' : 'phase-tail');
      }
      tr.innerHTML =
        '<td>' + row.period + '</td>' +
        '<td>' + formatCurrency(row.openingBalance) + '</td>' +
        '<td>' + formatCurrency(row.interest) + '</td>' +
        '<td>' + formatCurrency(row.accruedInterest) + '</td>' +
        '<td>' + formatCurrency(row.closingBalance) + '</td>';
      monthlyTbody.appendChild(tr);
    });

    yearlyTbody.innerHTML = '';
    data.yearlyRows.forEach(function (row) {
      var tr = document.createElement('tr');
      if (isProgressive) {
        var firstMonth = (row.year - 1) * 12 + 1;
        tr.classList.add(firstMonth <= data.drawMonths ? 'phase-draw' : 'phase-tail');
      }
      tr.innerHTML =
        '<td>' + row.year + '</td>' +
        '<td>' + formatCurrency(row.openingBalance) + '</td>' +
        '<td>' + formatCurrency(row.interest) + '</td>' +
        '<td>' + formatCurrency(row.accruedInterest) + '</td>' +
        '<td>' + formatCurrency(row.closingBalance) + '</td>';
      yearlyTbody.appendChild(tr);
    });
  }

  function showResults(data) {
    setBreakdownTab('monthly');
    var termMonths = parseInt(form.term.value, 10) || 0;
    if (calculationTitleEl) {
      calculationTitleEl.textContent = termMonths ? 'Calculation for ' + termMonths + ' month' + (termMonths !== 1 ? 's' : '') : 'Calculation';
    }
    facilitySizeEl.textContent = formatCurrency(data.facilitySize);
    totalInterestEl.textContent = formatCurrency(data.totalInterest);
    facilityFeeResultEl.textContent = formatCurrency(data.facilityFee);
    totalCostEl.textContent = formatCurrency(data.totalCost);
    finalBalanceEl.textContent = formatCurrency(data.finalBalance);
    effectiveRateEl.textContent = formatPercent(data.effectiveRate);
    if (data.progressiveSummary) {
      progressiveSummaryEl.textContent = data.progressiveSummary;
      progressiveSummaryEl.hidden = false;
    } else {
      progressiveSummaryEl.hidden = true;
    }
    if (data.isProgressive && data.drawMonths != null && breakdownLegendEl) {
      breakdownLegendEl.hidden = false;
      if (breakdownLegendDrawLabel) {
        breakdownLegendDrawLabel.textContent = 'Months 1–' + data.drawMonths + ': Utilisation period (' + (data.utilisationPct != null ? data.utilisationPct + '%' : '') + ')';
      }
      if (breakdownLegendTailLabel) {
        breakdownLegendTailLabel.textContent = 'Months ' + (data.drawMonths + 1) + '+: 100% utilisation';
      }
    } else if (breakdownLegendEl) {
      breakdownLegendEl.hidden = true;
    }
    renderTables(data);
    updateStackedBarChart(parseNum(form.principal.value), data.totalInterest);
  }

  function updateStackedBarChart(principal, totalInterest) {
    var wrap = document.getElementById('stacked-bar-chart');
    var segPrincipal = document.getElementById('chart-segment-principal');
    var segInterest = document.getElementById('chart-segment-interest');
    if (!wrap || !segPrincipal || !segInterest) return;
    principal = principal !== principal || principal < 0 ? 0 : principal;
    totalInterest = totalInterest !== totalInterest || totalInterest < 0 ? 0 : totalInterest;
    var total = principal + totalInterest;
    if (total <= 0) {
      wrap.setAttribute('aria-hidden', 'true');
      segPrincipal.style.width = '0%';
      segInterest.style.width = '0%';
      return;
    }
    wrap.setAttribute('aria-hidden', 'false');
    var pctPrincipal = (principal / total) * 100;
    var pctInterest = (totalInterest / total) * 100;
    segPrincipal.style.width = pctPrincipal + '%';
    segInterest.style.width = pctInterest + '%';
  }

  function clearResults() {
    if (calculationTitleEl) calculationTitleEl.textContent = 'Calculation';
    facilitySizeEl.textContent = '–';
    totalInterestEl.textContent = '–';
    facilityFeeResultEl.textContent = '–';
    totalCostEl.textContent = '–';
    finalBalanceEl.textContent = '–';
    effectiveRateEl.textContent = '–';
    progressiveSummaryEl.hidden = true;
    if (breakdownLegendEl) breakdownLegendEl.hidden = true;
    monthlyTbody.innerHTML = '';
    yearlyTbody.innerHTML = '';
    updateStackedBarChart(0, 0);
  }

  function clearAll() {
    form.principal.value = '';
    form.rate.value = '';
    form.frequency.value = '12';
    facilityTypeFully.checked = true;
    progressiveOptions.hidden = true;
    form['construction-period'].value = '';
    form.utilisation.value = '55';
    form.term.value = '';
    form['facility-fee'].value = '0';
    clearResults();
    form.principal.focus();
  }

  if (form.principal) {
    form.principal.addEventListener('input', maskPrincipalInput);
    form.principal.addEventListener('blur', maskPrincipalInput);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var result = runCalculation();
    if (!result.valid) {
      alert(result.message);
      return;
    }
    showResults(result);
  });

  clearBtn.addEventListener('click', clearAll);

  var rateFeeFields = document.getElementById('rate-fee-fields');
  var rateFeeContainer = document.getElementById('rate-fee-fields-container');
  var fullyDrawnOptions = document.getElementById('fully-drawn-options');

  function updateProgressiveVisibility() {
    var isProgress = facilityTypeProgress.checked;
    progressiveOptions.hidden = !isProgress;
    if (fullyDrawnOptions) fullyDrawnOptions.hidden = isProgress;
    if (rateFeeFields) {
      if (isProgress && rateFeeContainer) {
        rateFeeContainer.appendChild(rateFeeFields);
      } else if (fullyDrawnOptions) {
        var placeholder = document.getElementById('rate-fee-fields-placeholder');
        if (placeholder) placeholder.appendChild(rateFeeFields);
      }
    }
  }

  facilityTypeFully.addEventListener('change', updateProgressiveVisibility);
  facilityTypeProgress.addEventListener('change', updateProgressiveVisibility);
  updateProgressiveVisibility();

  var frequencySelect = form.frequency;

  var frequencyTooltipTrigger = document.getElementById('frequency-tooltip-trigger');
  var frequencyTooltipPopover = document.getElementById('frequency-tooltip-popover');
  var frequencyTooltipWrap = frequencyTooltipTrigger && frequencyTooltipTrigger.closest('.tooltip-wrap');
  if (frequencyTooltipTrigger && frequencyTooltipPopover && frequencyTooltipWrap) {
    function closeFrequencyTooltip() {
      frequencyTooltipWrap.classList.remove('open');
      frequencyTooltipPopover.setAttribute('hidden', '');
      frequencyTooltipTrigger.setAttribute('aria-expanded', 'false');
    }
    function openFrequencyTooltip() {
      frequencyTooltipWrap.classList.add('open');
      frequencyTooltipPopover.removeAttribute('hidden');
      frequencyTooltipTrigger.setAttribute('aria-expanded', 'true');
    }
    frequencyTooltipTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      if (frequencyTooltipWrap.classList.contains('open')) {
        closeFrequencyTooltip();
      } else {
        openFrequencyTooltip();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && frequencyTooltipWrap.classList.contains('open')) {
        closeFrequencyTooltip();
        frequencyTooltipTrigger.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (frequencyTooltipWrap.classList.contains('open') && !frequencyTooltipWrap.contains(e.target)) {
        closeFrequencyTooltip();
      }
    });
    frequencyTooltipTrigger.addEventListener('blur', function () {
      setTimeout(function () {
        if (!frequencyTooltipWrap.contains(document.activeElement)) {
          closeFrequencyTooltip();
        }
      }, 0);
    });
  }

  function setBreakdownTab(tab) {
    var isMonthly = tab === 'monthly';
    tabMonthly.classList.toggle('active', isMonthly);
    tabYearly.classList.toggle('active', !isMonthly);
    tabMonthly.setAttribute('aria-selected', isMonthly ? 'true' : 'false');
    tabYearly.setAttribute('aria-selected', !isMonthly ? 'true' : 'false');
    if (panelMonthly) {
      panelMonthly.classList.toggle('hidden', !isMonthly);
    }
    if (panelYearly) {
      panelYearly.classList.toggle('hidden', isMonthly);
    }
  }

  if (tabMonthly) {
    tabMonthly.addEventListener('click', function () { setBreakdownTab('monthly'); });
  }
  if (tabYearly) {
    tabYearly.addEventListener('click', function () { setBreakdownTab('yearly'); });
  }

  function getActiveTable() {
    var isMonthly = panelMonthly && !panelMonthly.classList.contains('hidden');
    return isMonthly
      ? document.getElementById('monthly-table')
      : document.getElementById('yearly-table');
  }

  function getActiveTableKind() {
    return panelMonthly && !panelMonthly.classList.contains('hidden') ? 'monthly' : 'yearly';
  }

  function tableToData(table) {
    if (!table) return { headers: [], rows: [] };
    var headers = [];
    var thead = table.querySelector('thead tr');
    if (thead) {
      var ths = thead.querySelectorAll('th');
      for (var i = 0; i < ths.length; i++) headers.push(ths[i].textContent.trim());
    }
    var rows = [];
    var tbody = table.querySelector('tbody');
    if (tbody) {
      var trs = tbody.querySelectorAll('tr');
      for (var r = 0; r < trs.length; r++) {
        var row = [];
        var tds = trs[r].querySelectorAll('td');
        for (var c = 0; c < tds.length; c++) row.push(tds[c].textContent.trim());
        rows.push(row);
      }
    }
    return { headers: headers, rows: rows };
  }

  function escapeCsvCell(str) {
    if (/[",\r\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  function exportToCSV() {
    var table = getActiveTable();
    var kind = getActiveTableKind();
    var data = tableToData(table);
    if (data.rows.length === 0 && data.headers.length === 0) return;
    var line = data.headers.map(escapeCsvCell).join(',');
    var csv = line + '\r\n';
    data.rows.forEach(function (row) {
      csv += row.map(escapeCsvCell).join(',') + '\r\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'breakdown-' + kind + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportToPDF() {
    var table = getActiveTable();
    var kind = getActiveTableKind();
    var data = tableToData(table);
    if (data.rows.length === 0 && data.headers.length === 0) return;

    var disclaimerText = 'Disclaimer: This calculator is intended for illustrative purposes and provides estimates only. Results are for general guidance and do not constitute a formal offer of finance or a credit approval. Actual interest rates, fees, and facility terms will depend on individual circumstances and lender criteria. Mercer Funding Group recommends seeking independent financial and legal advice before entering into any loan facility.';

    var PDF_LOGO_DATA_URL = null;
    try {
      var b64 = (function () { /* PDF_LOGO_B64 */ return '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'; })();
      if (b64) PDF_LOGO_DATA_URL = 'data:image/png;base64,' + b64;
    } catch (e) {}

    if (PDF_LOGO_DATA_URL) {
      buildAndSavePdf({ dataUrl: PDF_LOGO_DATA_URL });
      return;
    }

    function buildAndSavePdf(logoImg) {
      try {
        var JsPDF = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
        if (!JsPDF) return;
        var doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        var marginLeft = 14;
        var marginRight = 14;
        var cursorY = 14;

        var logoData = null;
        if (logoImg && logoImg.dataUrl) {
          logoData = { format: 'PNG', data: logoImg.dataUrl };
        } else if (logoImg && logoImg.tagName && logoImg.tagName.toUpperCase() === 'IMG' && (logoImg.naturalWidth || logoImg.width)) {
          logoData = { format: 'PNG', data: logoImg };
        } else if (logoImg && logoImg.img && (logoImg.img.naturalWidth || logoImg.img.width)) {
          logoData = { format: 'PNG', data: logoImg.img };
        }
        var logoHeight = 14;
        var logoWidth = 14;
        if (logoData) {
          try {
            doc.addImage(logoData.data, logoData.format, marginLeft, cursorY, logoWidth, logoHeight);
          } catch (e) {
            console.warn('Logo could not be added to PDF', e);
          }
        }

        var pdfTitle = 'Capitalisation Interest Calculator Report';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        var titleX = marginLeft + logoWidth + 5;
        var titleBaselineY = cursorY + logoHeight / 2 + 2;
        doc.text(pdfTitle, titleX, titleBaselineY);
        cursorY += Math.max(logoHeight, 10) + 6;

        var facilitySizeText = facilitySizeEl && facilitySizeEl.textContent ? facilitySizeEl.textContent.trim() : '–';
        var totalInterestText = totalInterestEl && totalInterestEl.textContent ? totalInterestEl.textContent.trim() : '–';
        var totalCostText = totalCostEl && totalCostEl.textContent ? totalCostEl.textContent.trim() : '–';
        var finalBalanceText = finalBalanceEl && finalBalanceEl.textContent ? finalBalanceEl.textContent.trim() : '–';
        var effectiveRateText = effectiveRateEl && effectiveRateEl.textContent ? effectiveRateEl.textContent.trim() : '–';

        var principalInput = form && form.principal ? form.principal.value : '';
        var termInput = form && form.term ? form.term.value : '';
        var rateInput = form && form.rate ? form.rate.value : '';
        var frequencyInput = form && form.frequency ? form.frequency.options[form.frequency.selectedIndex].text : '';
        var feeInput = form && form['facility-fee'] ? form['facility-fee'].value : '';
        var isProgressive = facilityTypeProgress && facilityTypeProgress.checked;
        var facilityTypeLabel = isProgressive ? 'Progress Draw' : 'Fully Drawn';
        var constructionPeriodInput = form && form['construction-period'] ? form['construction-period'].value : '';
        var utilisationInput = form && form.utilisation ? form.utilisation.value : '';

        var pageWidth = doc.internal.pageSize.width || 297;
        var contentWidth = pageWidth - marginLeft - marginRight;
        var cardGap = 8;
        var cardWidth = (contentWidth - cardGap) / 2;
        var leftCardX = marginLeft;
        var rightCardX = marginLeft + cardWidth + cardGap;
        var cardHeight = 62;
        var cardPadding = 5;
        var cardsRowTop = cursorY;

        doc.setFillColor(248, 248, 248);
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.2);
        doc.rect(leftCardX, cardsRowTop, cardWidth, cardHeight, 'F');
        doc.rect(leftCardX, cardsRowTop, cardWidth, cardHeight, 'S');
        doc.rect(rightCardX, cardsRowTop, cardWidth, cardHeight, 'F');
        doc.rect(rightCardX, cardsRowTop, cardWidth, cardHeight, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Scenario Inputs', leftCardX + cardPadding, cardsRowTop + 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        var scenarioLabels = [
          'Facility type: ',
          'Amount required (net): ',
          'Facility term (months): ',
          'Construction period (months): ',
          'Utilisation during draw (%): ',
          'Interest rate (% p.a.): ',
          'Capitalisation frequency: ',
          'Facility fee (%): '
        ];
        var scenarioValues = [
          facilityTypeLabel,
          principalInput || '–',
          termInput || '–',
          isProgressive ? (constructionPeriodInput || '–') : '–',
          isProgressive ? (utilisationInput || '–') : '–',
          rateInput || '–',
          frequencyInput || '–',
          feeInput || '–'
        ];
        var scenarioLabelWidth = 0;
        scenarioLabels.forEach(function (l) { scenarioLabelWidth = Math.max(scenarioLabelWidth, doc.getTextWidth(l)); });
        var scenarioValueX = leftCardX + cardPadding + scenarioLabelWidth;
        scenarioLabels.forEach(function (label, index) {
          var rowY = cardsRowTop + 18 + index * 5;
          doc.text(label, leftCardX + cardPadding, rowY);
          doc.text(scenarioValues[index], scenarioValueX, rowY);
        });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Summary of results', rightCardX + cardPadding, cardsRowTop + 10);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        var summaryLabels = [
          'Calculated facility size: ',
          'Finance cost (interest): ',
          'Total cost (interest + fee): ',
          'Final balance: ',
          'Effective annual rate: '
        ];
        var summaryValues = [facilitySizeText, totalInterestText, totalCostText, finalBalanceText, effectiveRateText];
        var summaryColors = [
          [13, 148, 136],
          [234, 88, 12],
          [37, 99, 235],
          null,
          null
        ];
        var summaryLabelWidth = 0;
        summaryLabels.forEach(function (l) { summaryLabelWidth = Math.max(summaryLabelWidth, doc.getTextWidth(l)); });
        var summaryValueX = rightCardX + cardPadding + summaryLabelWidth;
        var sumY = cardsRowTop + 18;
        summaryLabels.forEach(function (label, index) {
          doc.text(label, rightCardX + cardPadding, sumY);
          if (summaryColors[index]) {
            doc.setTextColor(summaryColors[index][0], summaryColors[index][1], summaryColors[index][2]);
          }
          doc.setFont('helvetica', 'bold');
          doc.text(summaryValues[index], summaryValueX, sumY);
          doc.setTextColor(0, 0, 0);
          doc.setFont('helvetica', 'normal');
          sumY += 6;
        });

        cursorY = cardsRowTop + cardHeight + 6;

        var generatedOn = new Date();
        var dateText = generatedOn.toLocaleDateString('en-AU', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });

        var pdfDrawMonths = isProgressive && constructionPeriodInput ? parseInt(constructionPeriodInput, 10) : 0;
        var useProgressiveColors = isProgressive && pdfDrawMonths > 0;

        if (useProgressiveColors) {
          var legendX = marginLeft;
          var legendY = cursorY;
          var swatchSize = 4;
          var swatchGap = 3;
          var lineGap = 5;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);

          // Line 1: blue swatch + utilisation period label
          doc.setFillColor(224, 242, 254); // light blue
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.1);
          doc.rect(legendX, legendY - swatchSize + 1, swatchSize, swatchSize, 'FD');
          doc.setTextColor(0, 0, 0);
          var drawLabel =
            'Utilisation period: months 1–' +
            pdfDrawMonths +
            (utilisationInput ? ' (' + utilisationInput + '% utilisation)' : '');
          doc.text(drawLabel, legendX + swatchSize + swatchGap, legendY);

          // Line 2: amber swatch + 100% utilisation label
          legendY += lineGap;
          doc.setFillColor(254, 243, 199); // light amber
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.1);
          doc.rect(legendX, legendY - swatchSize + 1, swatchSize, swatchSize, 'FD');
          var tailLabel = '100% utilisation period: months ' + (pdfDrawMonths + 1) + '+';
          doc.text(tailLabel, legendX + swatchSize + swatchGap, legendY);

          doc.setTextColor(0, 0, 0);
          cursorY = legendY + lineGap;
        }

        var autoTableOptions = {
          head: [data.headers],
          body: data.rows,
          startY: cursorY,
          margin: { left: marginLeft, right: marginRight, bottom: 32 },
          styles: {
            fontSize: 9,
            cellPadding: 2,
            valign: 'middle'
          },
          headStyles: {
            fillColor: [240, 240, 240],
            textColor: 0,
            fontStyle: 'bold'
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 18 },
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' },
            4: { halign: 'right' }
          },
          didDrawCell: function (data) {
            if (data.section !== 'head') return;
            var cell = data.cell;
            var colIndex = data.column.index;
            var halign = colIndex === 0 ? 'center' : 'right';
            var text = (cell.text && cell.text[0]) || cell.raw || '';
            doc.setFillColor(240, 240, 240);
            doc.rect(cell.x, cell.y, cell.width, cell.height, 'F');
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(0, 0, 0);
            var textY = cell.y + cell.height / 2 + 1;
            var textX = halign === 'center' ? cell.x + cell.width / 2 : cell.x + cell.width - 2;
            doc.text(text, textX, textY, { align: halign });
          },
          didDrawPage: function (data) {
            var pageSize = doc.internal.pageSize;
            var pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
            var pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
            var footerY = pageHeight - 10;
            var disclaimerLineHeight = 4;
            var gapAboveGenerated = 4;
            var wrappedDisclaimer = doc.splitTextToSize(disclaimerText, pageWidth - marginLeft - marginRight);
            var disclaimerStartY = footerY - gapAboveGenerated - wrappedDisclaimer.length * disclaimerLineHeight;

            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            wrappedDisclaimer.forEach(function (line, index) {
              doc.text(line, marginLeft, disclaimerStartY + index * disclaimerLineHeight);
            });

            doc.setFontSize(8);
            doc.text('Generated on: ' + dateText, marginLeft, footerY);

            var pageStr = 'Page ' + doc.internal.getNumberOfPages();
            var textWidth = doc.getTextWidth(pageStr);
            doc.text(pageStr, pageWidth - marginRight - textWidth, footerY);
          }
        };

        if (useProgressiveColors) {
          var bodyRowIndex = 0;
          autoTableOptions.theme = 'plain';
          autoTableOptions.bodyStyles = { fillColor: false };
          autoTableOptions.didParseCell = function (data) {
            if (data.section !== 'body') return;
            if (data.column.index === 0) bodyRowIndex++;
            var rowIndex = bodyRowIndex - 1;
            var firstMonthOneBased = kind === 'monthly' ? rowIndex + 1 : rowIndex * 12 + 1;
            var isDraw = firstMonthOneBased <= pdfDrawMonths;
            data.cell.styles.fillColor = isDraw ? [224, 242, 254] : [254, 243, 199];
          };
          autoTableOptions.willDrawCell = function (data) {
            if (data.section !== 'body') return;
            var rowIndex = (function () {
              var body = data.table && data.table.body;
              if (!body) return 0;
              for (var i = 0; i < body.length; i++) {
                if (body[i] === data.row) return i;
              }
              return 0;
            })();
            var firstMonthOneBased = kind === 'monthly' ? rowIndex + 1 : rowIndex * 12 + 1;
            var isDraw = firstMonthOneBased <= pdfDrawMonths;
            var rgb = isDraw ? [224, 242, 254] : [254, 243, 199];
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          };
        } else {
          autoTableOptions.alternateRowStyles = { fillColor: [248, 248, 248] };
        }

        doc.autoTable(autoTableOptions);

        var filename = 'capitalisation-breakdown-' + kind + '.pdf';
        doc.save(filename);
      } catch (e) {
        console.error(e);
      }
    }

    function doBuildPdf(logoPayload) {
      buildAndSavePdf(logoPayload);
    }

    var logoUrl = (function () {
      var el = document.querySelector('img.logo');
      if (el && el.src) return el.src;
      var base = window.location.href.replace(/[#?].*$/, '').replace(/[^/]+$/, '');
      return base + 'assets/mfg-logo.png';
    })();

    fetch(logoUrl, { mode: 'cors' }).then(function (response) {
      if (!response.ok) throw new Error('Logo load failed');
      return response.blob();
    }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }).then(function (dataUrl) {
      doBuildPdf({ dataUrl: dataUrl });
    }).catch(function () {
      var logoEl = document.querySelector('img.logo');
      var logoPayload = null;
      if (logoEl && logoEl.complete && (logoEl.naturalWidth || logoEl.width)) {
        try {
          var c = document.createElement('canvas');
          c.width = logoEl.naturalWidth || logoEl.width;
          c.height = logoEl.naturalHeight || logoEl.height;
          var ctx = c.getContext('2d');
          ctx.drawImage(logoEl, 0, 0);
          logoPayload = { dataUrl: c.toDataURL('image/png') };
        } catch (e) {
          logoPayload = logoEl;
        }
      }
      doBuildPdf(logoPayload);
    });
  }

  var exportCsvBtn = document.getElementById('export-csv');
  var exportPdfBtn = document.getElementById('export-pdf');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportToCSV);
  if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPDF);

  helpToggle.addEventListener('click', function () {
    var expanded = helpContent.hidden;
    helpContent.hidden = !expanded;
    helpToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
})();
