window.onerror = function(msg, src, lineno, colno, error) { alert('Terjadi Error di Browser: ' + msg + '\nBaris: ' + lineno); };
window.onunhandledrejection = function(e) { alert('Error Pengambilan Data: ' + (e.reason ? e.reason.message || e.reason : 'Unknown')); };

const API_URL = '/api';
let categoryChartInstance = null;
let categoryIncomeChartInstance = null;
let cashflowChartInstance = null;
let pemasukanChartInstance = null;
let pengeluaranChartInstance = null;
let allTransactions = [];
let allGoals = [];
let allWallets = [];

let currentPagePemasukan = 1;
let currentPagePengeluaran = 1;
let currentPageDashboard = 1;
const ITEMS_PER_PAGE = 10;

document.addEventListener('DOMContentLoaded', () => {
    // Navigasi
    const navs = {
        'nav-dashboard': 'dashboard-view',
        'nav-pemasukan': 'pemasukan-view',
        'nav-pengeluaran': 'pengeluaran-view',
        'nav-anggaran': 'anggaran-view',
        'nav-tabungan': 'tabungan-view',
        'nav-dompet': 'dompet-view'
    };

    Object.keys(navs).forEach(navId => {
        document.getElementById(navId).addEventListener('click', (e) => {
            // Remove active from all navs and views
            Object.keys(navs).forEach(id => {
                document.getElementById(id).classList.remove('active');
                document.getElementById(navs[id]).classList.remove('active');
            });
            // Add active to clicked nav and corresponding view
            e.currentTarget.classList.add('active');
            document.getElementById(navs[navId]).classList.add('active');
        });
    });

    // Format Helpers
    const formatRupiah = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
    const formatDate = (dateString) => new Date(dateString).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });

    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toast-message');
        toastMessage.textContent = message;
        if (isError) toast.classList.add('error');
        else toast.classList.remove('error');
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.classList.add('hidden'), 300);
        }, 3000);
    };

    const getFilterQuery = () => {
        const month = document.getElementById('filter-month').value;
        const year = document.getElementById('filter-year').value;
        return (month && year) ? `?month=${month}&year=${year}` : '';
    };

    document.getElementById('filter-month').addEventListener('change', loadData);
    document.getElementById('filter-year').addEventListener('change', loadData);

    const cashflowRange = document.getElementById('cashflow-range');
    const cashflowStart = document.getElementById('cashflow-start');
    const cashflowEnd = document.getElementById('cashflow-end');
    
    if (cashflowRange) {
        cashflowRange.addEventListener('change', loadCashflowChart);
    }
    
    if (cashflowStart) {
        cashflowStart.addEventListener('change', () => {
            if (cashflowRange) cashflowRange.value = 'custom';
            loadCashflowChart();
        });
    }
    if (cashflowEnd) {
        cashflowEnd.addEventListener('change', () => {
            if (cashflowRange) cashflowRange.value = 'custom';
            loadCashflowChart();
        });
    }

    // Pemasukan Analytics Filters
    const pemFilterMonth = document.getElementById('pem-filter-month');
    const pemFilterYear = document.getElementById('pem-filter-year');
    if(pemFilterMonth) pemFilterMonth.addEventListener('change', loadPemasukanAnalytics);
    if(pemFilterYear) pemFilterYear.addEventListener('change', loadPemasukanAnalytics);

    const pemChartStart = document.getElementById('pem-chart-start');
    const pemChartEnd = document.getElementById('pem-chart-end');
    const pemChartGroup = document.getElementById('pem-chart-group');
    if(pemChartStart) pemChartStart.addEventListener('change', loadPemasukanChart);
    if(pemChartEnd) pemChartEnd.addEventListener('change', loadPemasukanChart);
    if(pemChartGroup) pemChartGroup.addEventListener('change', loadPemasukanChart);

    // Pengeluaran Analytics Filters
    const pengFilterMonth = document.getElementById('peng-filter-month');
    const pengFilterYear = document.getElementById('peng-filter-year');
    if(pengFilterMonth) pengFilterMonth.addEventListener('change', loadPengeluaranAnalytics);
    if(pengFilterYear) pengFilterYear.addEventListener('change', loadPengeluaranAnalytics);

    const pengChartStart = document.getElementById('peng-chart-start');
    const pengChartEnd = document.getElementById('peng-chart-end');
    const pengChartGroup = document.getElementById('peng-chart-group');
    if(pengChartStart) pengChartStart.addEventListener('change', loadPengeluaranChart);
    if(pengChartEnd) pengChartEnd.addEventListener('change', loadPengeluaranChart);
    if(pengChartGroup) pengChartGroup.addEventListener('change', loadPengeluaranChart);

    // Pagination Events
    const btnDashPrev = document.getElementById('dashboard-prev-btn');
    const btnDashNext = document.getElementById('dashboard-next-btn');
    if(btnDashPrev) {
        btnDashPrev.addEventListener('click', () => {
            if(currentPageDashboard > 1) {
                currentPageDashboard--;
                renderAllTables();
            }
        });
    }
    if(btnDashNext) {
        btnDashNext.addEventListener('click', () => {
            const totalPages = Math.ceil(allTransactions.length / ITEMS_PER_PAGE) || 1;
            if(currentPageDashboard < totalPages) {
                currentPageDashboard++;
                renderAllTables();
            }
        });
    }

    const btnPemPrev = document.getElementById('pem-prev');
    const btnPemNext = document.getElementById('pem-next');
    if(btnPemPrev) {
        btnPemPrev.addEventListener('click', () => {
            if(currentPagePemasukan > 1) {
                currentPagePemasukan--;
                renderAllTables();
            }
        });
    }
    if(btnPemNext) {
        btnPemNext.addEventListener('click', () => {
            const allPemasukan = allTransactions.filter(t => t.Jenis === 'Pemasukan');
            const totalPages = Math.ceil(allPemasukan.length / ITEMS_PER_PAGE) || 1;
            if(currentPagePemasukan < totalPages) {
                currentPagePemasukan++;
                renderAllTables();
            }
        });
    }

    const btnPengPrev = document.getElementById('peng-prev');
    const btnPengNext = document.getElementById('peng-next');
    if(btnPengPrev) {
        btnPengPrev.addEventListener('click', () => {
            if(currentPagePengeluaran > 1) {
                currentPagePengeluaran--;
                renderAllTables();
            }
        });
    }
    if(btnPengNext) {
        btnPengNext.addEventListener('click', () => {
            const allPengeluaran = allTransactions.filter(t => t.Jenis === 'Pengeluaran');
            const totalPages = Math.ceil(allPengeluaran.length / ITEMS_PER_PAGE) || 1;
            if(currentPagePengeluaran < totalPages) {
                currentPagePengeluaran++;
                renderAllTables();
            }
        });
    }

    // Pemasukan Table Filters
    const pemTblSearch = document.getElementById('pem-table-filter-search');
    const pemTblMth = document.getElementById('pem-table-filter-month');
    const pemTblYr = document.getElementById('pem-table-filter-year');
    const pemTblCat = document.getElementById('pem-table-filter-category');
    if(pemTblSearch) pemTblSearch.addEventListener('input', () => { currentPagePemasukan = 1; renderAllTables(); });
    if(pemTblMth) pemTblMth.addEventListener('change', () => { currentPagePemasukan = 1; renderAllTables(); });
    if(pemTblYr) pemTblYr.addEventListener('change', () => { currentPagePemasukan = 1; renderAllTables(); });
    if(pemTblCat) pemTblCat.addEventListener('change', () => { currentPagePemasukan = 1; renderAllTables(); });

    // Pengeluaran Table Filters
    const pengTblSearch = document.getElementById('peng-table-filter-search');
    const pengTblMth = document.getElementById('peng-table-filter-month');
    const pengTblYr = document.getElementById('peng-table-filter-year');
    const pengTblCat = document.getElementById('peng-table-filter-category');
    if(pengTblSearch) pengTblSearch.addEventListener('input', () => { currentPagePengeluaran = 1; renderAllTables(); });
    if(pengTblMth) pengTblMth.addEventListener('change', () => { currentPagePengeluaran = 1; renderAllTables(); });
    if(pengTblYr) pengTblYr.addEventListener('change', () => { currentPagePengeluaran = 1; renderAllTables(); });
    if(pengTblCat) pengTblCat.addEventListener('change', () => { currentPagePengeluaran = 1; renderAllTables(); });

    // Initial Load
    loadData();

    async function loadData() {
        await loadWallets(); // Load wallets first for dropdowns
        await loadGoals(); // Load goals first for dropdowns
        await loadSummaryAndCharts();
        await loadTransactions();
        await loadPemasukanAnalytics();
        await loadPengeluaranAnalytics();
        await loadAnggaran();
    }

    async function loadGoals() {
        try {
            const res = await fetch(`${API_URL}/goals`);
            if (res.ok) {
                allGoals = await res.json();
                renderGoals();
                updateGoalDropdowns();
            }
        } catch(e) { console.error('Error load goals', e); }
    }

    function renderGoals() {
        const container = document.getElementById('goals-container');
        const emptyState = document.getElementById('goals-empty');
        if(container) container.innerHTML = '';
        
        if (allGoals.length === 0) {
            if(emptyState) emptyState.classList.remove('hidden');
            if(container) container.classList.add('hidden');
            const balanceEl = document.getElementById('total-goal-balance');
            if(balanceEl) balanceEl.textContent = 'Rp0';
            return;
        } else {
            if(emptyState) emptyState.classList.add('hidden');
            if(container) container.classList.remove('hidden');
        }

        let totalBalance = 0;

        allGoals.forEach(g => {
            totalBalance += g.Terkumpul;
            let perc = g.TargetNominal > 0 ? (g.Terkumpul / g.TargetNominal) * 100 : 0;
            if (perc > 100) perc = 100;
            if (perc < 0) perc = 0;
            
            let iconClass = 'fa-piggy-bank';
            const cat = g.IconCategory || 'casual';
            if (cat === 'travel') { iconClass = 'fa-plane-departure'; }
            else if (cat === 'gadget') { iconClass = 'fa-mobile-screen'; }
            else if (cat === 'fashion') { iconClass = 'fa-bag-shopping'; }
            else if (cat === 'electronics') { iconClass = 'fa-computer'; }
            
            container.innerHTML += `
                <div class="premium-goal-card" style="cursor: pointer;" onclick="document.getElementById('topup-modal').classList.add('show'); document.getElementById('topup-tujuan').value='${g.Id}'; document.getElementById('topup-tanggal').value = new Date().toISOString().split('T')[0]; document.getElementById('topup-modal-title').textContent = 'Top Up: ${g.NamaTarget}';">
                    <button class="delete-goal-btn premium-goal-delete" data-id="${g.Id}" onclick="event.stopPropagation();"><i class="fa-solid fa-xmark"></i></button>
                    
                    <div class="premium-goal-icon-box">
                        <i class="fa-solid ${iconClass} fa-flip" style="--fa-animation-duration: 4s;"></i>
                    </div>
                    
                    <div class="premium-goal-info">
                        <div class="premium-goal-header">
                            <h3>${g.NamaTarget}</h3>
                        </div>
                        <div class="premium-progress-wrapper">
                            <div class="premium-progress-fill" style="width: ${perc}%; background: ${perc >= 100 ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, var(--color-primary), #60a5fa)'}; box-shadow: ${perc >= 100 ? '0 0 10px rgba(16, 185, 129, 0.5)' : '0 0 10px rgba(59, 130, 246, 0.5)'};"></div>
                        </div>
                        <div class="premium-goal-stats">
                            <span class="premium-goal-current">${formatRupiah(g.Terkumpul)}</span>
                            <span class="premium-goal-target">${perc.toFixed(0)}% dari ${formatRupiah(g.TargetNominal)}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        const balanceEl = document.getElementById('total-goal-balance');
        if(balanceEl) balanceEl.textContent = formatRupiah(totalBalance);

        // Delete Actions
        document.querySelectorAll('.delete-goal-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // prevent card click
                const id = e.currentTarget.getAttribute('data-id');
                if(confirm('Yakin ingin menghapus target ini? Semua transaksi terkait akan kehilangan referensi target.')) {
                    try {
                        const res = await fetch(`${API_URL}/goals/${id}`, { method: 'DELETE' });
                        if(res.ok) {
                            showToast("Goal berhasil dihapus");
                            loadGoals();
                        } else {
                            const err = await res.json();
                            alert(err.error);
                        }
                    } catch(e) { console.error('Error deleting goal', e); }
                }
            });
        });
    }


    function updateGoalDropdowns() {
        const tabunganDropdown = document.getElementById('tabungan-tujuan');
        const editTujuanDropdown = document.getElementById('edit-tujuan');
        
        const optionsHTML = `<option value="" disabled selected>Pilih Tujuan (Target)</option>` + 
            allGoals.map(g => `<option value="${g.Id}">${g.NamaTarget}</option>`).join('');
            
        if(tabunganDropdown) tabunganDropdown.innerHTML = optionsHTML;
        if(editTujuanDropdown) editTujuanDropdown.innerHTML = optionsHTML;
    }

    async function loadSummaryAndCharts() {
        try {
            const query = getFilterQuery();
            const summaryRes = await fetch(`${API_URL}/summary${query}`);
            if (summaryRes.ok) {
                const sum = await summaryRes.json();
                document.getElementById('total-pemasukan').textContent = formatRupiah(sum.TotalPemasukan);
                document.getElementById('total-pengeluaran').textContent = formatRupiah(sum.TotalPengeluaran);
                document.getElementById('total-tabungan').textContent = formatRupiah(sum.TotalTabungan);
                document.getElementById('total-saldo').textContent = formatRupiah(sum.Saldo);
            }

            // Charts - Category Pengeluaran
            const catRes = await fetch(`${API_URL}/chart/categories${query}`);
            if (catRes.ok) {
                const catData = await catRes.json();
                
                const seriesData = catData.length ? catData.map(d => ({
                    name: d.Kategori,
                    y: d.Total,
                    sliced: true,
                    selected: true
                })) : [{ name: 'Belum ada data', y: 1 }];

                if (categoryChartInstance && typeof categoryChartInstance.destroy === 'function') categoryChartInstance.destroy();
                categoryChartInstance = Highcharts.chart('categoryChart', {
                    chart: {
                        type: 'pie',
                        backgroundColor: 'transparent',
                        options3d: {
                            enabled: true,
                            alpha: 45,
                            beta: 0
                        }
                    },
                    title: { text: null },
                    tooltip: {
                        pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
                    },
                    plotOptions: {
                        pie: {
                            allowPointSelect: true,
                            cursor: 'pointer',
                            depth: 45,
                            size: '75%', /* Reduced from 100% to leave room for labels on mobile */
                            slicedOffset: 10,
                            dataLabels: {
                                enabled: true,
                                format: '<b>{point.name}</b><br>{point.percentage:.1f} %',
                                distance: 15,
                                style: {
                                    fontSize: '11px', /* Slightly smaller for mobile safety */
                                    fontFamily: 'inherit',
                                    color: '#1e293b',
                                    textOutline: 'none',
                                    fontWeight: '600'
                                },
                                connectorColor: '#94a3b8'
                            },
                            colors: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#64748b']
                        }
                    },
                    series: [{
                        type: 'pie',
                        name: 'Persentase',
                        data: seriesData
                    }],
                    credits: { enabled: false }
                });
            }

            // Charts - Category Pemasukan
            const catIncRes = await fetch(`${API_URL}/chart/categories-income${query}`);
            if (catIncRes.ok) {
                const catIncData = await catIncRes.json();
                
                const seriesData = catIncData.length ? catIncData.map(d => ({
                    name: d.Kategori,
                    y: d.Total,
                    sliced: true,
                    selected: true
                })) : [{ name: 'Belum ada data', y: 1 }];

                if (categoryIncomeChartInstance && typeof categoryIncomeChartInstance.destroy === 'function') categoryIncomeChartInstance.destroy();
                categoryIncomeChartInstance = Highcharts.chart('categoryIncomeChart', {
                    chart: {
                        type: 'pie',
                        backgroundColor: 'transparent',
                        options3d: {
                            enabled: true,
                            alpha: 45,
                            beta: 0
                        }
                    },
                    title: { text: null },
                    tooltip: {
                        pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
                    },
                    plotOptions: {
                        pie: {
                            allowPointSelect: true,
                            cursor: 'pointer',
                            depth: 45,
                            size: '75%', /* Reduced from 100% to leave room for labels on mobile */
                            slicedOffset: 10,
                            dataLabels: {
                                enabled: true,
                                format: '<b>{point.name}</b><br>{point.percentage:.1f} %',
                                distance: 15,
                                style: {
                                    fontSize: '11px', /* Slightly smaller for mobile safety */
                                    fontFamily: 'inherit',
                                    color: '#1e293b',
                                    textOutline: 'none',
                                    fontWeight: '600'
                                },
                                connectorColor: '#94a3b8'
                            },
                            colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b', '#ef4444']
                        }
                    },
                    series: [{
                        type: 'pie',
                        name: 'Persentase',
                        data: seriesData
                    }],
                    credits: { enabled: false }
                });
            }

            await loadCashflowChart();
        } catch(e) { console.error('Error load summary', e); }
    }

    async function loadCashflowChart() {
        try {
            const rangeSelect = document.getElementById('cashflow-range');
            const range = rangeSelect ? rangeSelect.value : 'monthly';
            let query = `?range=${range}`;
            
            if (range === 'custom') {
                const start = document.getElementById('cashflow-start')?.value;
                const end = document.getElementById('cashflow-end')?.value;
                if (!start || !end) return; // Do not fetch if dates are missing
                query += `&start=${start}&end=${end}`;
            }
            
            const res = await fetch(`${API_URL}/chart/cashflow${query}`);
            if (res.ok) {
                const flowData = await res.json();
                
                const labels = [];
                if (range === 'daily') {
                    for (let i = 6; i >= 0; i--) {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        labels.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
                    }
                } else if (range === 'yearly') {
                    for (let i = 4; i >= 0; i--) {
                        const d = new Date();
                        d.setFullYear(d.getFullYear() - i);
                        labels.push(String(d.getFullYear()));
                    }
                } else if (range === 'custom') {
                    // Just use the labels returned by the API
                    flowData.forEach(d => {
                        if (!labels.includes(d.Label)) labels.push(d.Label);
                    });
                    labels.sort(); // Sort chronologically
                } else {
                    for (let i = 11; i >= 0; i--) {
                        const d = new Date();
                        d.setMonth(d.getMonth() - i);
                        labels.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
                    }
                }
                
                const mappedFlowData = labels.map(label => {
                    // API returns alias 'Label' in new server update
                    const found = flowData.find(d => d.Label === label || d.Bulan === label);
                    return {
                        Label: label,
                        Pemasukan: found ? found.Pemasukan : 0,
                        Pengeluaran: found ? found.Pengeluaran : 0
                    };
                });

                const ctxFlow = document.getElementById('cashflowChart').getContext('2d');
                if (cashflowChartInstance) cashflowChartInstance.destroy();
                cashflowChartInstance = new Chart(ctxFlow, {
                    type: 'line',
                    data: {
                        labels: mappedFlowData.map(d=>d.Label),
                        datasets: [
                            { 
                                label: 'Pemasukan', 
                                data: mappedFlowData.map(d=>d.Pemasukan), 
                                borderColor: '#10b981', 
                                backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4,
                                pointBackgroundColor: '#10b981',
                                pointRadius: 4,
                                pointHoverRadius: 6
                            },
                            { 
                                label: 'Pengeluaran', 
                                data: mappedFlowData.map(d=>d.Pengeluaran), 
                                borderColor: '#ef4444', 
                                backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                                borderWidth: 3,
                                fill: true,
                                tension: 0.4,
                                pointBackgroundColor: '#ef4444',
                                pointRadius: 4,
                                pointHoverRadius: 6
                            }
                        ]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false, 
                        interaction: { mode: 'index', intersect: false },
                        scales: { 
                            y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.5)', drawBorder: false }, ticks: { color: '#64748b' } }, 
                            x: { grid: { display: false, drawBorder: false }, ticks: { color: '#64748b' } } 
                        }, 
                        plugins: { 
                            legend: { position: 'top', labels: { color: '#64748b', usePointStyle: true, boxWidth: 8 } },
                            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 12, cornerRadius: 8, titleFont: { size: 14 } }
                        } 
                    }
                });
            }
        } catch(e) { console.error('Error load summary', e); }
    }

    async function loadTransactions() {
        try {
            const query = getFilterQuery();
            const res = await fetch(`${API_URL}/transactions${query}`);
            if (res.ok) {
                allTransactions = await res.json();
                renderAllTables();
            }
        } catch(e) { console.error('Error load transactions', e); }
    }

    async function loadPemasukanAnalytics() {
        // Only load if on pemasukan view (optimization), but for now we just load it
        try {
            const m = document.getElementById('pem-filter-month')?.value || '';
            const y = document.getElementById('pem-filter-year')?.value || '';
            const query = (m && y) ? `?month=${m}&year=${y}` : '';
            
            const res = await fetch(`${API_URL}/pemasukan/summary${query}`);
            if(res.ok) {
                const data = await res.json();
                document.getElementById('stat-pem-total').textContent = formatRupiah(data.CurrentTotal);
                const badge = document.getElementById('stat-pem-change');
                const perc = parseFloat(data.PercentageChange);
                if(perc > 0) {
                    badge.textContent = `🔼 Naik ${perc}% vs Bulan Lalu`;
                    badge.className = 'badge badge-income';
                } else if(perc < 0) {
                    badge.textContent = `🔽 Turun ${Math.abs(perc)}% vs Bulan Lalu`;
                    badge.className = 'badge badge-expense';
                } else {
                    badge.textContent = `Tetap vs Bulan Lalu`;
                    badge.className = 'badge badge-neutral';
                }
            }
            
            await loadPemasukanChart();
        } catch(e) { console.error('Error load pemasukan analytics', e); }
    }

    async function loadPemasukanChart() {
        try {
            const start = document.getElementById('pem-chart-start')?.value || '';
            const end = document.getElementById('pem-chart-end')?.value || '';
            const group = document.getElementById('pem-chart-group')?.value || 'daily';
            
            // Default dates if empty: current month
            let qStart = start;
            let qEnd = end;
            if(!qStart || !qEnd) {
                const now = new Date();
                const y = now.getFullYear();
                const m = now.getMonth();
                const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
                const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];
                if(!qStart) qStart = firstDay;
                if(!qEnd) qEnd = lastDay;
            }

            const res = await fetch(`${API_URL}/chart/pemasukan?startDate=${qStart}&endDate=${qEnd}&groupBy=${group}`);
            if(res.ok) {
                const data = await res.json();
                const ctx = document.getElementById('pemasukanChart');
                if(!ctx) return;
                
                if (pemasukanChartInstance) pemasukanChartInstance.destroy();
                pemasukanChartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.length ? data.map(d=>d.Label) : ['Belum ada data'],
                        datasets: [{
                            label: 'Pemasukan',
                            data: data.length ? data.map(d=>d.Total) : [0],
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3,
                            pointBackgroundColor: '#10b981'
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        scales: { 
                            y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } }, 
                            x: { grid: { display: false }, ticks: { color: '#64748b' } } 
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        } catch(e) { console.error('Error load pemasukan chart', e); }
    }

    async function loadPengeluaranAnalytics() {
        try {
            const m = document.getElementById('peng-filter-month')?.value || '';
            const y = document.getElementById('peng-filter-year')?.value || '';
            const query = (m && y) ? `?month=${m}&year=${y}` : '';
            
            const res = await fetch(`${API_URL}/pengeluaran/summary${query}`);
            if(res.ok) {
                const data = await res.json();
                document.getElementById('stat-peng-total').textContent = formatRupiah(data.CurrentTotal);
                const badge = document.getElementById('stat-peng-change');
                const perc = parseFloat(data.PercentageChange);
                if(perc > 0) {
                    badge.textContent = `🔼 Naik ${perc}% vs Bulan Lalu`;
                    badge.className = 'badge badge-expense';
                } else if(perc < 0) {
                    badge.textContent = `🔽 Turun ${Math.abs(perc)}% vs Bulan Lalu`;
                    badge.className = 'badge badge-income';
                } else {
                    badge.textContent = `Tetap vs Bulan Lalu`;
                    badge.className = 'badge badge-neutral';
                }
            }
            
            await loadPengeluaranChart();
        } catch(e) { console.error('Error load pengeluaran analytics', e); }
    }

    async function loadPengeluaranChart() {
        try {
            const start = document.getElementById('peng-chart-start')?.value || '';
            const end = document.getElementById('peng-chart-end')?.value || '';
            const group = document.getElementById('peng-chart-group')?.value || 'daily';
            
            let qStart = start;
            let qEnd = end;
            if(!qStart || !qEnd) {
                const now = new Date();
                const y = now.getFullYear();
                const m = now.getMonth();
                const firstDay = new Date(y, m, 1).toISOString().split('T')[0];
                const lastDay = new Date(y, m + 1, 0).toISOString().split('T')[0];
                if(!qStart) qStart = firstDay;
                if(!qEnd) qEnd = lastDay;
            }

            const res = await fetch(`${API_URL}/chart/pengeluaran?startDate=${qStart}&endDate=${qEnd}&groupBy=${group}`);
            if(res.ok) {
                const data = await res.json();
                const ctx = document.getElementById('pengeluaranChart');
                if(!ctx) return;
                
                if (pengeluaranChartInstance) pengeluaranChartInstance.destroy();
                pengeluaranChartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.length ? data.map(d=>d.Label) : ['Belum ada data'],
                        datasets: [{
                            label: 'Pengeluaran',
                            data: data.length ? data.map(d=>d.Total) : [0],
                            borderColor: '#ef4444',
                            backgroundColor: 'rgba(239, 68, 68, 0.2)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.3,
                            pointBackgroundColor: '#ef4444'
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        scales: { 
                            y: { beginAtZero: true, grid: { color: '#e2e8f0' }, ticks: { color: '#64748b' } }, 
                            x: { grid: { display: false }, ticks: { color: '#64748b' } } 
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        } catch(e) { console.error('Error load pengeluaran chart', e); }
    }

    function renderAllTables() {
        // Mini Summary: Pemasukan (Total handled by analytics API now, just compute max here)
        const pems = allTransactions.filter(t => t.Jenis === 'Pemasukan');
        const maxPem = pems.length ? Math.max(...pems.map(t => t.Nominal)) : 0;
        let maxPemCat = '-';
        if (pems.length > 0) {
            const pem = pems.find(t => t.Nominal === maxPem);
            if(pem) maxPemCat = pem.Kategori;
        }
        
        const maxPemEl = document.getElementById('stat-pem-max');
        if(maxPemEl) maxPemEl.textContent = formatRupiah(maxPem);
        const maxPemCatEl = document.getElementById('stat-pem-max-cat');
        if(maxPemCatEl) maxPemCatEl.textContent = `Kategori: ${maxPemCat}`;
        
        // Mini Summary: Pengeluaran
        const pengs = allTransactions.filter(t => t.Jenis === 'Pengeluaran');
        const maxPeng = pengs.length ? Math.max(...pengs.map(t => t.Nominal)) : 0;
        let maxPengCat = '-';
        if (pengs.length > 0) {
            const peng = pengs.find(t => t.Nominal === maxPeng);
            if(peng) maxPengCat = peng.Kategori;
        }
        const maxPengEl = document.getElementById('stat-peng-max');
        if(maxPengEl) maxPengEl.textContent = formatRupiah(maxPeng);
        const maxPengCatEl = document.getElementById('stat-peng-max-cat');
        if(maxPengCatEl) maxPengCatEl.textContent = `Kategori: ${maxPengCat}`;

        // Dashboard Table (Paginated)
        const dashTbody = document.querySelector('#dashboard-transactions-table tbody');
        if(dashTbody) {
            dashTbody.innerHTML = '';
            
            const totalPagesDash = Math.ceil(allTransactions.length / ITEMS_PER_PAGE) || 1;
            if (currentPageDashboard > totalPagesDash) currentPageDashboard = totalPagesDash;
            if (currentPageDashboard < 1) currentPageDashboard = 1;
            
            const startDash = (currentPageDashboard - 1) * ITEMS_PER_PAGE;
            const endDash = startDash + ITEMS_PER_PAGE;
            const paginatedDash = allTransactions.slice(startDash, endDash);

            paginatedDash.forEach(t => {
                const isInc = t.Jenis === 'Pemasukan' || t.Jenis === 'Tarik Tabungan';
                const cls = isInc ? 'text-income' : 'text-expense';
                const sign = isInc ? '+' : '-';
                const cat = t.Jenis === 'Menabung' || t.Jenis === 'Tarik Tabungan' ? t.NamaTarget : t.Kategori;
                dashTbody.innerHTML += `<tr>
                    <td>${formatDate(t.Tanggal)}</td>
                    <td>${t.Jenis}</td>
                    <td>${cat || '-'}</td>
                    <td class="${cls}">${sign} ${formatRupiah(t.Nominal)}</td>
                </tr>`;
            });
            
            // Update Dashboard Pagination UI
            const pageInfoDash = document.getElementById('dashboard-page-info');
            const btnPrevDash = document.getElementById('dashboard-prev-btn');
            const btnNextDash = document.getElementById('dashboard-next-btn');
            
            if(pageInfoDash) pageInfoDash.textContent = `Halaman ${currentPageDashboard} dari ${totalPagesDash}`;
            if(btnPrevDash) btnPrevDash.disabled = currentPageDashboard === 1;
            if(btnNextDash) btnNextDash.disabled = currentPageDashboard === totalPagesDash;
        }

        // Pemasukan Table
        const pemTbody = document.querySelector('#pemasukan-table tbody');
        if(pemTbody) {
            pemTbody.innerHTML = '';
            
            // Get filter values
            const sFilter = document.getElementById('pem-table-filter-search')?.value.toLowerCase();
            const mFilter = document.getElementById('pem-table-filter-month')?.value;
            const yFilter = document.getElementById('pem-table-filter-year')?.value;
            const cFilter = document.getElementById('pem-table-filter-category')?.value;

            let allPemasukan = allTransactions.filter(t => t.Jenis === 'Pemasukan');

            // Apply filters
            if (sFilter || mFilter || yFilter || cFilter) {
                allPemasukan = allPemasukan.filter(t => {
                    const date = new Date(t.Tanggal);
                    const matchS = !sFilter || (t.Keterangan && t.Keterangan.toLowerCase().includes(sFilter));
                    const matchM = !mFilter || (date.getMonth() + 1).toString() === mFilter;
                    const matchY = !yFilter || date.getFullYear().toString() === yFilter;
                    const matchC = !cFilter || t.Kategori === cFilter;
                    return matchS && matchM && matchY && matchC;
                });
            }

            const totalPages = Math.ceil(allPemasukan.length / ITEMS_PER_PAGE) || 1;
            
            if (currentPagePemasukan > totalPages) currentPagePemasukan = totalPages;
            if (currentPagePemasukan < 1) currentPagePemasukan = 1;
            
            const startIdx = (currentPagePemasukan - 1) * ITEMS_PER_PAGE;
            const endIdx = startIdx + ITEMS_PER_PAGE;
            
            const pemsToShow = allPemasukan.slice(startIdx, endIdx);
            
            pemsToShow.forEach(t => {
                pemTbody.innerHTML += `<tr>
                    <td>${formatDate(t.Tanggal)}</td>
                    <td>${t.Kategori}</td>
                    <td>${t.MetodePembayaran || '-'}</td>
                    <td>${t.Keterangan || '-'}</td>
                    <td class="text-income">+ ${formatRupiah(t.Nominal)}</td>
                    <td>
                        <button class="edit-btn" data-trx='${JSON.stringify(t)}'>Edit</button>
                        <button class="delete-btn" data-id="${t.Id}">Hapus</button>
                    </td>
                </tr>`;
            });
            
            const pageInfo = document.getElementById('pem-page-info');
            if(pageInfo) pageInfo.textContent = `Halaman ${currentPagePemasukan} dari ${totalPages}`;
            
            const btnPrev = document.getElementById('pem-prev');
            const btnNext = document.getElementById('pem-next');
            if(btnPrev) btnPrev.disabled = currentPagePemasukan === 1;
            if(btnNext) btnNext.disabled = currentPagePemasukan === totalPages;
        }

        // Pengeluaran Table
        const pengTbody = document.querySelector('#pengeluaran-table tbody');
        if(pengTbody) {
            pengTbody.innerHTML = '';
            
            // Get filter values
            const sFilter = document.getElementById('peng-table-filter-search')?.value.toLowerCase();
            const mFilter = document.getElementById('peng-table-filter-month')?.value;
            const yFilter = document.getElementById('peng-table-filter-year')?.value;
            const cFilter = document.getElementById('peng-table-filter-category')?.value;

            let allPengeluaran = allTransactions.filter(t => t.Jenis === 'Pengeluaran');

            // Apply filters
            if (sFilter || mFilter || yFilter || cFilter) {
                allPengeluaran = allPengeluaran.filter(t => {
                    const date = new Date(t.Tanggal);
                    const matchS = !sFilter || (t.Keterangan && t.Keterangan.toLowerCase().includes(sFilter));
                    const matchM = !mFilter || (date.getMonth() + 1).toString() === mFilter;
                    const matchY = !yFilter || date.getFullYear().toString() === yFilter;
                    const matchC = !cFilter || t.Kategori === cFilter;
                    return matchS && matchM && matchY && matchC;
                });
            }

            const totalPages = Math.ceil(allPengeluaran.length / ITEMS_PER_PAGE) || 1;
            
            if (currentPagePengeluaran > totalPages) currentPagePengeluaran = totalPages;
            if (currentPagePengeluaran < 1) currentPagePengeluaran = 1;
            
            const startIdx = (currentPagePengeluaran - 1) * ITEMS_PER_PAGE;
            const endIdx = startIdx + ITEMS_PER_PAGE;
            
            const pengsToShow = allPengeluaran.slice(startIdx, endIdx);
            
            pengsToShow.forEach(t => {
                pengTbody.innerHTML += `<tr>
                    <td>${formatDate(t.Tanggal)}</td>
                    <td>${t.Kategori}</td>
                    <td>${t.MetodePembayaran || '-'}</td>
                    <td>${t.Keterangan || '-'}</td>
                    <td class="text-expense">- ${formatRupiah(t.Nominal)}</td>
                    <td>
                        <button class="edit-btn" data-trx='${JSON.stringify(t)}'>Edit</button>
                        <button class="delete-btn" data-id="${t.Id}">Hapus</button>
                    </td>
                </tr>`;
            });
            
            const pageInfo = document.getElementById('peng-page-info');
            if(pageInfo) pageInfo.textContent = `Halaman ${currentPagePengeluaran} dari ${totalPages}`;
            
            const btnPrev = document.getElementById('peng-prev');
            const btnNext = document.getElementById('peng-next');
            if(btnPrev) btnPrev.disabled = currentPagePengeluaran === 1;
            if(btnNext) btnNext.disabled = currentPagePengeluaran === totalPages;
        }

        // Tabungan Table
        const tabTbody = document.querySelector('#tabungan-table tbody');
        if(tabTbody) {
            tabTbody.innerHTML = '';
            allTransactions.filter(t => t.Jenis === 'Menabung' || t.Jenis === 'Tarik Tabungan').forEach(t => {
                const isTarik = t.Jenis === 'Tarik Tabungan';
                const cls = isTarik ? 'text-income' : 'text-expense'; 
                tabTbody.innerHTML += `<tr>
                    <td>${formatDate(t.Tanggal)}</td>
                    <td>${t.Jenis}</td>
                    <td>${t.NamaTarget || '-'}</td>
                    <td class="${cls}">${formatRupiah(t.Nominal)}</td>
                    <td>
                        <button class="edit-btn" data-trx='${JSON.stringify(t)}'>Edit</button>
                        <button class="delete-btn" data-id="${t.Id}">Hapus</button>
                    </td>
                </tr>`;
            });
        }
    }

    // Submit Forms
    const handleFormSubmit = async (e, jenis) => {
        e.preventDefault();
        let payload = {};
        
        if (jenis === 'Pemasukan') {
            payload = {
                Tanggal: document.getElementById('pemasukan-tanggal').value,
                Jenis: 'Pemasukan',
                Kategori: document.getElementById('pemasukan-kategori').value,
                MetodePembayaran: document.getElementById('pemasukan-metode').value,
                Nominal: parseFloat(document.getElementById('pemasukan-nominal').value),
                Keterangan: document.getElementById('pemasukan-keterangan').value
            };
        } else if (jenis === 'Pengeluaran') {
            payload = {
                Tanggal: document.getElementById('pengeluaran-tanggal').value,
                Jenis: 'Pengeluaran',
                Kategori: document.getElementById('pengeluaran-kategori').value,
                MetodePembayaran: document.getElementById('pengeluaran-metode').value,
                Nominal: parseFloat(document.getElementById('pengeluaran-nominal').value),
                Keterangan: document.getElementById('pengeluaran-keterangan').value
            };
        }

        try {
            const res = await fetch(`${API_URL}/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast(`${jenis} berhasil disimpan!`);
                e.target.reset();
                loadData();
            } else {
                const err = await res.json();
                showToast(err.error || 'Gagal menyimpan', true);
            }
        } catch (error) {
            showToast('Terjadi kesalahan koneksi', true);
        }
    };

    const pemForm = document.getElementById('pemasukan-form');
    if (pemForm) pemForm.addEventListener('submit', (e) => handleFormSubmit(e, 'Pemasukan'));
    
    const pengForm = document.getElementById('pengeluaran-form');
    if (pengForm) pengForm.addEventListener('submit', (e) => handleFormSubmit(e, 'Pengeluaran'));

    // Goal Form Submit
    const btnAddGoal = document.getElementById('btn-add-goal');
    if(btnAddGoal) {
        btnAddGoal.addEventListener('click', () => {
            document.getElementById('goal-modal').classList.add('show');
        });
    }
    const btnEmpty = document.getElementById('btn-add-goal-empty');
    if(btnEmpty) {
        btnEmpty.addEventListener('click', () => {
            document.getElementById('goal-modal').classList.add('show');
        });
    }
    
    // Goal Type Selector Logic
    const goalTypeItems = document.querySelectorAll('.goal-type-item');
    const goalIconCategoryInput = document.getElementById('goal-icon-category');
    goalTypeItems.forEach(item => {
        item.addEventListener('click', () => {
            goalTypeItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            if(goalIconCategoryInput) {
                goalIconCategoryInput.value = item.getAttribute('data-type');
            }
        });
    });

    // Validate Premium Form button state
    const goalNameInput = document.getElementById('goal-nama');
    const goalNominalInput = document.getElementById('goal-nominal');
    const goalSubmitBtn = document.querySelector('.premium-submit-btn');
    function checkGoalForm() {
        if(goalNameInput && goalNominalInput && goalSubmitBtn) {
            if(goalNameInput.value.trim() !== '' && goalNominalInput.value.trim() !== '') {
                goalSubmitBtn.classList.add('ready');
            } else {
                goalSubmitBtn.classList.remove('ready');
            }
        }
    }
    if(goalNameInput) goalNameInput.addEventListener('input', checkGoalForm);
    if(goalNominalInput) goalNominalInput.addEventListener('input', checkGoalForm);

    document.querySelectorAll('.close-goal-modal').forEach(btn => btn.addEventListener('click', () => document.getElementById('goal-modal').classList.remove('show')));

    const goalForm = document.getElementById('goal-form');
    if(goalForm) {
        goalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                NamaTarget: document.getElementById('goal-nama').value,
                TargetNominal: parseFloat(document.getElementById('goal-nominal').value),
                IconCategory: document.getElementById('goal-icon-category') ? document.getElementById('goal-icon-category').value : 'casual'
            };
            try {
                const res = await fetch(`${API_URL}/goals`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    showToast("Target Tabungan berhasil disimpan");
                    document.getElementById('goal-form').reset();
                    document.getElementById('goal-modal').classList.remove('show');
                    // Reset type to casual
                    goalTypeItems.forEach(i => i.classList.remove('active'));
                    const casualType = document.querySelector('.goal-type-item[data-type="casual"]');
                    if(casualType) casualType.classList.add('active');
                    if(goalIconCategoryInput) goalIconCategoryInput.value = 'casual';
                    if(goalSubmitBtn) goalSubmitBtn.classList.remove('ready');

                    loadGoals();
                } else {
                    const err = await res.json();
                    alert(err.error);
                }
            } catch(e) { console.error('Error posting goal', e); }
        });
    }

    // Top Up Goal Logic
    document.querySelectorAll('.close-topup-modal').forEach(btn => btn.addEventListener('click', () => document.getElementById('topup-modal').classList.remove('show')));

    const topupForm = document.getElementById('topup-form');
    if(topupForm) {
        topupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                Tanggal: document.getElementById('topup-tanggal').value,
                Jenis: document.querySelector('input[name="topup-jenis"]:checked').value,
                Kategori: 'Target Tabungan', // Default kategori
                TujuanTabunganId: document.getElementById('topup-tujuan').value,
                Nominal: parseFloat(document.getElementById('topup-nominal').value),
                Keterangan: document.getElementById('topup-keterangan').value
            };
            try {
                const res = await fetch(`${API_URL}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if(res.ok) {
                    showToast('Transaksi berhasil');
                    topupForm.reset();
                    document.getElementById('topup-modal').classList.remove('show');
                    loadData(); // reload transactions
                    loadGoals(); // reload goal progress
                } else showToast('Gagal memproses', true);
            } catch(err) { showToast('Kesalahan koneksi', true); }
        });
    }

    // Edit Modal Logic
    document.querySelector('main').addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn')) {
            const id = e.target.getAttribute('data-id');
            if (confirm('Yakin hapus transaksi ini?')) {
                try {
                    const res = await fetch(`${API_URL}/transactions/${id}`, { method: 'DELETE' });
                    if (res.ok) { showToast('Dihapus'); loadData(); }
                    else showToast('Gagal hapus', true);
                } catch(err) { showToast('Error', true); }
            }
        }

        if (e.target.classList.contains('edit-btn')) {
            const t = JSON.parse(e.target.getAttribute('data-trx'));
            document.getElementById('edit-id').value = t.Id;
            document.getElementById('edit-jenis').value = t.Jenis;
            document.getElementById('edit-tanggal').value = t.Tanggal.split('T')[0];
            document.getElementById('edit-nominal').value = t.Nominal;
            document.getElementById('edit-keterangan').value = t.Keterangan || '';

            const katGrp = document.getElementById('edit-kategori-group');
            const metGrp = document.getElementById('edit-metode-group');
            const tujGrp = document.getElementById('edit-tujuan-group');
            const katSel = document.getElementById('edit-kategori');
            
            katGrp.style.display = 'none'; metGrp.style.display = 'none'; tujGrp.style.display = 'none';

            if (t.Jenis === 'Pemasukan') {
                katGrp.style.display = 'block'; metGrp.style.display = 'block';
                katSel.innerHTML = `
                    <option value="Gaji">Gaji</option>
                    <option value="Bonus">Bonus</option>
                    <option value="Hasil Bisnis">Hasil Bisnis</option>
                    <option value="Pencairan Investasi">Pencairan Investasi</option>
                    <option value="Lainnya">Lainnya</option>
                `;
                katSel.value = t.Kategori;
                document.getElementById('edit-metode').value = t.MetodePembayaran || '';
            } else if (t.Jenis === 'Pengeluaran') {
                katGrp.style.display = 'block'; metGrp.style.display = 'block';
                katSel.innerHTML = `
                    <option value="Makanan/Minuman">Makanan/Minuman</option>
                    <option value="Transportasi">Transportasi</option>
                    <option value="Tagihan/Utang">Tagihan/Utang</option>
                    <option value="Hiburan">Hiburan</option>
                    <option value="Belanja">Belanja</option>
                    <option value="Lainnya">Lainnya</option>
                `;
                katSel.value = t.Kategori;
                document.getElementById('edit-metode').value = t.MetodePembayaran || '';
            } else { // Tabungan
                tujGrp.style.display = 'block';
                document.getElementById('edit-tujuan').value = t.TujuanTabunganId;
            }

            document.getElementById('edit-modal').classList.add('show');
        }
    });

    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => document.getElementById('edit-modal').classList.remove('show')));

    document.getElementById('edit-transaction-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const jenis = document.getElementById('edit-jenis').value;
        
        let payload = {
            Tanggal: document.getElementById('edit-tanggal').value,
            Jenis: jenis,
            Nominal: parseFloat(document.getElementById('edit-nominal').value),
            Keterangan: document.getElementById('edit-keterangan').value
        };

        if (jenis === 'Pemasukan' || jenis === 'Pengeluaran') {
            payload.Kategori = document.getElementById('edit-kategori').value;
            payload.MetodePembayaran = document.getElementById('edit-metode').value;
        }
        if (jenis === 'Menabung' || jenis === 'Tarik Tabungan') payload.TujuanTabunganId = parseInt(document.getElementById('edit-tujuan').value);

        try {
            const res = await fetch(`${API_URL}/transactions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Perubahan disimpan!');
                document.getElementById('edit-modal').classList.remove('show');
                loadData();
            } else showToast('Gagal menyimpan', true);
        } catch (error) { showToast('Error', true); }
    });

    document.getElementById('btn-export').addEventListener('click', () => {
        if (!allTransactions.length) return showToast('Tidak ada data', true);
        let csv = "Tanggal,Jenis,Kategori/Tujuan,Metode,Nominal,Keterangan\n";
        allTransactions.forEach(t => {
            const cat = t.Jenis === 'Menabung' || t.Jenis === 'Tarik Tabungan' ? t.NamaTarget : t.Kategori;
            csv += `${t.Tanggal},${t.Jenis},${cat || '-'},${t.MetodePembayaran || '-'},${t.Nominal},"${t.Keterangan || ''}"\n`;
        });
        const link = document.createElement("a");
        link.href = encodeURI("data:text/csv;charset=utf-8," + csv);
        link.download = "Laporan_Keuangan.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // ===== ANGGARAN LOGIC =====
    const anggaranMonth = document.getElementById('anggaran-filter-month');
    const anggaranYear = document.getElementById('anggaran-filter-year');
    if (anggaranMonth) anggaranMonth.addEventListener('change', loadAnggaran);
    if (anggaranYear) anggaranYear.addEventListener('change', loadAnggaran);

    const btnAddAnggaran = document.getElementById('btn-add-anggaran');
    const anggaranModal = document.getElementById('anggaran-modal');
    const closeAnggaranModal = document.querySelector('.close-anggaran-modal');

    if (btnAddAnggaran) {
        btnAddAnggaran.addEventListener('click', () => {
            document.getElementById('anggaran-form').reset();
            document.getElementById('anggaran-id').value = '';
            anggaranModal.classList.add('show');
        });
    }

    if (closeAnggaranModal) {
        closeAnggaranModal.addEventListener('click', (e) => {
            e.preventDefault();
            anggaranModal.classList.remove('show');
        });
    }

    document.getElementById('anggaran-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const kategori = document.getElementById('anggaran-kategori').value;
        const nominal = parseFloat(document.getElementById('anggaran-nominal').value);

        try {
            const res = await fetch(`${API_URL}/budget/categories`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Kategori: kategori, Nominal: nominal })
            });
            if (res.ok) {
                showToast('Anggaran berhasil disimpan');
                anggaranModal.classList.remove('show');
                loadAnggaran();
            } else {
                const data = await res.json();
                showToast(data.error || 'Gagal menyimpan anggaran', true);
            }
        } catch (error) {
            showToast('Terjadi kesalahan jaringan', true);
        }
    });

    async function loadAnggaran() {
        const month = document.getElementById('anggaran-filter-month')?.value || '';
        const year = document.getElementById('anggaran-filter-year')?.value || '';
        let url = `${API_URL}/budget/categories`;
        if (month && year) {
            url += `?month=${month}&year=${year}`;
        }

        try {
            const res = await fetch(url);
            if (res.ok) {
                const budgets = await res.json();
                renderAnggaran(budgets);
            }
        } catch (error) {
            console.error('Error load anggaran', error);
        }
    }

    function renderAnggaran(budgets) {
        const container = document.getElementById('anggaran-container');
        const emptyState = document.getElementById('anggaran-empty');
        
        if (!container || !emptyState) return;

        if (budgets.length === 0) {
            container.innerHTML = '';
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        container.classList.remove('hidden');
        container.innerHTML = '';

        budgets.forEach(b => {
            let percentage = (b.Terpakai / b.BudgetNominal) * 100;
            if (percentage > 100) percentage = 100;
            
            let statusClass = 'safe';
            let statusText = 'Aman';
            if (percentage >= 80 && percentage < 100) {
                statusClass = 'warning';
                statusText = 'Hati-hati (Hampir Habis)';
            } else if (percentage >= 100) {
                statusClass = 'danger';
                statusText = 'Over Budget!';
            }

            const card = document.createElement('div');
            card.className = 'budget-card';
            card.innerHTML = `
                <div class="budget-header">
                    <div class="budget-category-title">
                        <i class="fa-solid fa-tag"></i> ${b.Kategori}
                    </div>
                    <div class="budget-actions">
                        <button class="budget-btn edit-budget" data-kat="${b.Kategori}" data-nom="${b.BudgetNominal}">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="budget-btn delete delete-budget" data-id="${b.Id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="budget-amounts">
                    <span class="budget-spent">${formatRupiah(b.Terpakai)} Terpakai</span>
                    <span class="budget-total">dari ${formatRupiah(b.BudgetNominal)}</span>
                </div>
                <div class="progress-container">
                    <div class="progress-bar ${statusClass}" style="width: ${percentage}%"></div>
                </div>
                <div class="budget-status status-${statusClass}">${statusText} (${percentage.toFixed(1)}%)</div>
            `;
            container.appendChild(card);
        });

        // Add Listeners for edit & delete
        document.querySelectorAll('.edit-budget').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('anggaran-kategori').value = target.getAttribute('data-kat');
                document.getElementById('anggaran-nominal').value = target.getAttribute('data-nom');
                anggaranModal.classList.add('show');
            });
        });

        document.querySelectorAll('.delete-budget').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Hapus anggaran ini?')) {
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        const res = await fetch(`${API_URL}/budget/categories/${id}`, { method: 'DELETE' });
                        if (res.ok) {
                            showToast('Anggaran dihapus');
                            loadAnggaran();
                        } else {
                            showToast('Gagal menghapus', true);
                        }
                    } catch (error) {
                        showToast('Error', true);
                    }
                }
            });
        });
    }

    // --- DOMPET LOGIC ---
    const dompetModal = document.getElementById('dompet-modal');
    const btnAddDompet = document.getElementById('btn-add-dompet');
    const closeDompetBtn = document.querySelector('.close-dompet-modal');
    const dompetForm = document.getElementById('dompet-form');

    if (btnAddDompet) {
        btnAddDompet.addEventListener('click', () => {
            document.getElementById('dompet-id').value = '';
            document.getElementById('dompet-nama').value = '';
            document.getElementById('dompet-saldo').value = '';
            document.getElementById('dompet-modal-title').textContent = 'Tambah Dompet Baru';
            dompetModal.classList.add('show');
        });
    }
    if (closeDompetBtn) {
        closeDompetBtn.addEventListener('click', () => {
            dompetModal.classList.remove('show');
        });
    }

    if (dompetForm) {
        dompetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('dompet-id').value;
            const nama = document.getElementById('dompet-nama').value;
            const saldo = document.getElementById('dompet-saldo').value;

            const url = id ? `${API_URL}/wallets/${id}` : `${API_URL}/wallets`;
            const method = id ? 'PUT' : 'POST';

            try {
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Nama: nama, SaldoAwal: saldo })
                });
                if (res.ok) {
                    showToast(`Dompet berhasil ${id ? 'diupdate' : 'ditambahkan'}`);
                    dompetModal.classList.remove('show');
                    loadData(); // reload everything as wallet change impacts transactions
                } else {
                    showToast('Gagal menyimpan dompet', true);
                }
            } catch (err) {
                showToast('Error menyimpan dompet', true);
            }
        });
    }

    async function loadWallets() {
        try {
            const res = await fetch(`${API_URL}/wallets`);
            if (res.ok) {
                allWallets = await res.json();
                renderWallets();
                updateWalletDropdowns();
            }
        } catch (e) { console.error('Error load wallets', e); }
    }

    function renderWallets() {
        const container = document.getElementById('dompet-container');
        const emptyState = document.getElementById('dompet-empty');
        if (!container || !emptyState) return;

        if (allWallets.length === 0) {
            emptyState.classList.remove('hidden');
            container.classList.add('hidden');
            const totalSaldoEl = document.getElementById('total-saldo');
            if (totalSaldoEl) totalSaldoEl.textContent = 'Rp0';
            return;
        }

        emptyState.classList.add('hidden');
        container.classList.remove('hidden');
        container.innerHTML = '';

        let totalSaldo = 0;

        allWallets.forEach(w => {
            totalSaldo += w.SaldoSaatIni;
            
            const card = document.createElement('div');
            card.className = 'goal-card';
            card.innerHTML = `
                <div class="goal-icon"><i class="fa-solid fa-wallet"></i></div>
                <div class="goal-info" style="flex-grow: 1;">
                    <h3>${w.Nama}</h3>
                    <p style="font-size: 0.9rem; color: var(--text-muted);">Saldo Awal: ${formatRupiah(w.SaldoAwal)}</p>
                </div>
                <div class="goal-progress" style="text-align: right;">
                    <p style="font-size: 1.2rem; font-weight: bold; color: var(--text-main); margin-bottom: 0.5rem;">${formatRupiah(w.SaldoSaatIni)}</p>
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="action-btn edit-dompet-btn" style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 0.4rem 0.8rem;" data-id="${w.Id}" data-nama="${w.Nama}" data-saldo="${w.SaldoAwal}"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete-dompet-btn" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 0.4rem 0.8rem;" data-id="${w.Id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });

        const totalSaldoEl = document.getElementById('total-saldo');
        if (totalSaldoEl) totalSaldoEl.textContent = formatRupiah(totalSaldo);

        // Events
        document.querySelectorAll('.edit-dompet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                document.getElementById('dompet-id').value = target.getAttribute('data-id');
                document.getElementById('dompet-nama').value = target.getAttribute('data-nama');
                document.getElementById('dompet-saldo').value = target.getAttribute('data-saldo');
                document.getElementById('dompet-modal-title').textContent = 'Edit Dompet';
                dompetModal.classList.add('show');
            });
        });

        document.querySelectorAll('.delete-dompet-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm('Hapus dompet ini? Transaksi yang menggunakan dompet ini akan kehilangan info metode pembayarannya.')) {
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        const res = await fetch(`${API_URL}/wallets/${id}`, { method: 'DELETE' });
                        if (res.ok) {
                            showToast('Dompet dihapus');
                            loadData();
                        } else {
                            showToast('Gagal menghapus dompet', true);
                        }
                    } catch (err) {
                        showToast('Error', true);
                    }
                }
            });
        });
    }

    function updateWalletDropdowns() {
        const pemSelector = document.getElementById('pemasukan-metode');
        const pengSelector = document.getElementById('pengeluaran-metode');
        const editSelector = document.getElementById('edit-metode');

        const optionsHtml = `<option value="" disabled selected>Pilih Dompet</option>` + 
            allWallets.map(w => `<option value="${w.Nama}">${w.Nama} (${formatRupiah(w.SaldoSaatIni)})</option>`).join('');
            
        if (pemSelector) pemSelector.innerHTML = optionsHtml;
        if (pengSelector) pengSelector.innerHTML = optionsHtml;
        if (editSelector) editSelector.innerHTML = optionsHtml;
    }

}); // end DOMContentLoaded
