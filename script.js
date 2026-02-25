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
    return rows;
  }

  /** Aggregate monthly rows into one row per year. */
  function buildYearlyRows(monthlyRows) {
    var yearly = [];
    var year = 1;
    var openBal = monthlyRows.length > 0 ? monthlyRows[0].openingBalance : 0;
    var interestSum = 0;

    for (var i = 0; i < monthlyRows.length; i++) {
      var row = monthlyRows[i];
      interestSum += row.interest;
      if (row.period % 12 === 0 || i === monthlyRows.length - 1) {
        yearly.push({
          year: year,
          openingBalance: openBal,
          interest: interestSum,
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
    var effectiveRate = (Math.pow(1 + rateDecimal / n, n) - 1) * 100;
    var facilityFee = facilityFeePct > 0 ? facilitySize * (facilityFeePct / 100) : 0;
    var totalCost = totalInterest + facilityFee;

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
      progressiveSummary: progressiveSummary
    };
  }

  function renderTables(data) {
    monthlyTbody.innerHTML = '';
    data.monthlyRows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + row.period + '</td>' +
        '<td>' + formatCurrency(row.openingBalance) + '</td>' +
        '<td>' + formatCurrency(row.interest) + '</td>' +
        '<td>' + formatCurrency(row.closingBalance) + '</td>';
      monthlyTbody.appendChild(tr);
    });

    yearlyTbody.innerHTML = '';
    data.yearlyRows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + row.year + '</td>' +
        '<td>' + formatCurrency(row.openingBalance) + '</td>' +
        '<td>' + formatCurrency(row.interest) + '</td>' +
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
    try {
      var JsPDF = window.jsPDF || (window.jspdf && window.jspdf.jsPDF);
      if (!JsPDF) return;
      var doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.autoTable({
        head: [data.headers],
        body: data.rows,
        startY: 10,
        margin: { left: 10, right: 10 },
        styles: { fontSize: 9 },
        headStyles: { fillColor: [240, 240, 240] }
      });
      doc.save('breakdown-' + kind + '.pdf');
    } catch (e) {
      console.error(e);
    }
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

  var footerCtaForm = document.getElementById('footer-cta-form');
  if (footerCtaForm) {
    footerCtaForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (footerCtaForm.querySelector('[name="name"]') && footerCtaForm.querySelector('[name="name"]').value) || '';
      var email = (footerCtaForm.querySelector('[name="email"]') && footerCtaForm.querySelector('[name="email"]').value) || '';
      var phone = (footerCtaForm.querySelector('[name="phone"]') && footerCtaForm.querySelector('[name="phone"]').value) || '';
      var body = 'Name: ' + name + '\nEmail: ' + email + '\nPhone: ' + (phone || 'Not provided');
      var subject = 'Contact from Capitalisation Interest Calculator';
      var mailtoUrl = 'mailto:enquiries@mercerfg.com.au?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      window.location.href = mailtoUrl;
    });
  }
})();
