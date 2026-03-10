const API_URL = "https://BitNex.pythonanywhere.com"; 
const USER_ID = 1;

let allAssets = [];
let favorites = JSON.parse(localStorage.getItem('bitnex_favs')) || [];
let currentSymbol = null;
let currentTF = 'D';
let currentChartType = 'candles';
let previousPrice = null; 

let tvWidget = null;
let priceUpdateInterval = null;

let currentSlide = 0;
let newsInterval;

// --- ТОРГОВІ ЗМІННІ FUTURES ---
let currentCurrency = 'USDT';
let currentLeverage = 20;
let currentTradeMode = 'market'; 
let currentMarginMode = 'cross'; 
let tpslVisible = false;
let currentOrderType = 'LONG'; 
let editingPositionId = null; 

// --- ТОРГОВІ ЗМІННІ SPOT ---
let currentSpotTradeMode = 'market';
let currentSpotOrderType = 'BUY';

function init() {
    if (window.Telegram && window.Telegram.WebApp) {
        window.Telegram.WebApp.expand();
    }

    renderNewsSlides();
    startSlider();
    loadUserData();
    fetchMarketData();
    calculateLivePnL();
    
    setInterval(() => {
        fetchMarketData();
        calculateLivePnL();
        updatePositionsRealTime(); 
    }, 2000); 
}

function showAlert(title, message, iconClass = 'fa-circle-info') {
    document.getElementById('custom-alert-title').innerText = title;
    document.getElementById('custom-alert-text').innerText = message;
    document.getElementById('custom-alert-icon').innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    document.getElementById('custom-alert').style.display = 'flex';
}

function closeCustomAlert() {
    document.getElementById('custom-alert').style.display = 'none';
}

function showConfirm(title, message, onConfirmCallback) {
    document.getElementById('custom-confirm-title').innerText = title;
    document.getElementById('custom-confirm-text').innerText = message;
    document.getElementById('custom-confirm').style.display = 'flex';
    
    document.getElementById('custom-confirm-ok').onclick = function() {
        document.getElementById('custom-confirm').style.display = 'none';
        if(onConfirmCallback) onConfirmCallback();
    };
}

function closeCustomConfirm() {
    document.getElementById('custom-confirm').style.display = 'none';
}

function showFeatureAlert(featureName) {
    showAlert('Info', `Section "${featureName}" is under development! 🚀`, 'fa-rocket');
}

function renderNewsSlides() {
    const track = document.getElementById('news-track');
    const dotsContainer = document.getElementById('slider-dots');
    if(!track || !dotsContainer) return;

    track.innerHTML = '';
    dotsContainer.innerHTML = '';

    const newsToRender = [
        { title: "Bitcoin Institutional Adoption Hits New Peak", source: "Bloomberg", image: "https://i.ibb.co/1Y4dgWz7/Getty-Images-2187851274.jpg", url: "https://www.bloomberg.com/crypto" },
        { title: "Technical Analysis: BTC Support Levels", source: "TradingView", image: "https://i.ibb.co/N6D1HD1J/1736480893756.jpg", url: "https://www.tradingview.com/markets/cryptocurrencies/" },
        { title: "Global Market Capitalization Visualization", source: "Market Analytics", image: "https://i.ibb.co/7dkw5vZG/cryptocurrency-market-visualization-stockcake.webp", url: "https://coinmarketcap.com/" },
        { title: "Behind Sam Bankman-Fried’s Journey", source: "FTX co-founder", image: "https://i.ibb.co/HpFhg8cG/2121221212121.webp", url: "https://cointelegraph.com/tags/gamefi" }
    ];

    newsToRender.forEach((news, index) => {
        const slide = document.createElement('div');
        slide.className = 'banner-slide';
        slide.style.cursor = "pointer";
        slide.onclick = () => { if (news.url) window.open(news.url, '_blank'); }; 
        slide.innerHTML = `<img src="${news.image}" class="news-bg-img" alt="news"><div class="slide-overlay"></div><div class="slide-content"><span class="news-source">${news.source}</span><h3>${news.title}</h3></div>`;
        track.appendChild(slide);

        const dot = document.createElement('div');
        dot.className = `dot ${index === 0 ? 'active' : ''}`;
        dotsContainer.appendChild(dot);
    });
}

function startSlider() {
    if (newsInterval) clearInterval(newsInterval);
    newsInterval = setInterval(() => {
        currentSlide++;
        const track = document.getElementById('news-track');
        if (!track) return;
        if (currentSlide >= track.children.length) currentSlide = 0;
        updateSliderPosition();
    }, 5000);
}

function updateSliderPosition() {
    const track = document.getElementById('news-track');
    const dots = document.querySelectorAll('.dot');
    if(track) track.style.transform = `translateX(-${currentSlide * 100}%)`;
    dots.forEach(d => d.classList.remove('active'));
    if(dots[currentSlide]) dots[currentSlide].classList.add('active');
}

async function addTestFunds() {
    showAlert('Deposit', 'Deposit request sent! (Demo)', 'fa-wallet');
}

async function loadUserData() {
    try {
        let balance = localStorage.getItem('bitnex_balance');
        if (!balance) {
            balance = 10000;
            localStorage.setItem('bitnex_balance', balance);
        }
        const balanceEl = document.getElementById('main-balance');
        if (balanceEl) balanceEl.innerText = parseFloat(balance).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    } catch (e) {}
}

async function calculateLivePnL() {
    try {
        const positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
        let totalPnL = 0;
        positions.forEach(pos => {
            const coin = allAssets.find(c => c.symbol === pos.symbol);
            if (coin && !pos.isPending) {
                const currentPrice = parseFloat(coin.price);
                if (pos.type === 'LONG') totalPnL += ((currentPrice - pos.entryPrice) / pos.entryPrice) * pos.amount;
                else totalPnL += ((pos.entryPrice - currentPrice) / pos.entryPrice) * pos.amount;
            }
        });

        // Додаємо PnL від Spot позицій
        let spotTotalValue = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('bitnex_spot_')) {
                const symbol = key.replace('bitnex_spot_', '');
                const amount = parseFloat(localStorage.getItem(key));
                if (amount > 0) {
                    const coin = allAssets.find(c => c.symbol === symbol);
                    if (coin) spotTotalValue += amount * parseFloat(coin.price);
                }
            }
        }

        let balance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
        const pnlPercent = balance > 0 ? (totalPnL / balance) * 100 : 0;
        
        const pnlEl = document.getElementById('pnl-display');
        if (pnlEl) {
            const sign = totalPnL >= 0 ? '+' : '';
            pnlEl.className = 'pnl-row ' + (totalPnL >= 0 ? 'positive' : 'negative');
            pnlEl.innerText = `Futures P&L ${sign}${totalPnL.toFixed(2)} USD | Spot Value $${spotTotalValue.toFixed(2)}`;
        }
    } catch (e) {}
}

async function fetchMarketData() {
    try {
        const res = await fetch(`${API_URL}/api/assets`);
        allAssets = await res.json();
        const activeFilterBtn = document.querySelector('.filter-btn.active');
        const filterType = activeFilterBtn ? activeFilterBtn.innerText.toLowerCase() : 'popular';
        renderHomeList(filterType);
        
        const futuresView = document.getElementById('futures-view');
        if(futuresView && futuresView.classList.contains('active')) {
            renderFuturesList();
        }
        
        const tradeView = document.getElementById('trade-view');
        if(tradeView && tradeView.classList.contains('active')) {
            renderSpotList();
        }
        
        if(document.getElementById('futures-detail-view').classList.contains('active') && currentSymbol) {
            updateDetailPrices();
        }
        
        if(document.getElementById('spot-detail-view').classList.contains('active') && currentSpotSymbol) {
            updateSpotDetailPrices();
        }
    } catch (e) {}
}

function filterHomeData(type, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderHomeList(type);
}

function getCryptoLogoUrl(symbol) {
    return `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${symbol.toLowerCase()}.png`;
}

function handleLogoError(imgElement, symbol) {
    imgElement.onerror = null;
    imgElement.src = `https://via.placeholder.com/64/1E2026/FFA500?text=${symbol.substring(0, 2).toUpperCase()}`;
}

function renderHomeList(type) {
    const list = document.getElementById('home-market-list');
    if (!list) return;
    list.innerHTML = '';
    let data = [...allAssets];

    const formatMCap = (num) => {
        if(num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if(num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        return num.toLocaleString();
    };

    if(type === 'popular') data.sort((a, b) => b.market_cap - a.market_cap);
    else if(type === 'gainers') data.sort((a, b) => b.change_24h - a.change_24h);
    else if(type === 'losers') data.sort((a, b) => a.change_24h - b.change_24h);
    else if(type === 'mcap') data.sort((a, b) => b.market_cap - a.market_cap);
    else if(type === 'favorites') {
        data = allAssets.filter(coin => favorites.includes(coin.symbol));
        if(data.length === 0) { list.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">No favorites yet.</p>'; return; }
    }

    data.forEach(coin => {
        const div = document.createElement('div');
        div.className = 'asset-card';
        div.onclick = () => openFuturesDetail(coin.symbol);
        
        const price = parseFloat(coin.price);
        const change = parseFloat(coin.change_24h);
        const mcap = parseFloat(coin.market_cap);
        
        let subtitle = coin.name; 
        if (type === 'mcap') subtitle = `MCap: $${formatMCap(mcap)}`;
        
        div.innerHTML = `
            <div class="coin-left">
                <img src="${getCryptoLogoUrl(coin.symbol)}" class="coin-logo" onerror="handleLogoError(this, '${coin.symbol}')">
                <div class="coin-info">
                    <span class="coin-symbol">${coin.symbol}</span>
                    <span class="coin-name">${subtitle}</span>
                </div>
            </div>
            <div class="coin-right">
                <div class="price-box"><span class="coin-price">$${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</span></div>
                <div class="change-badge ${change >= 0 ? 'bg-green' : 'bg-red'}">${change > 0 ? '+' : ''}${change.toFixed(2)}%</div>
            </div>
        `;
        list.appendChild(div);
    });
}

function renderFuturesList(searchQuery = '') {
    const list = document.getElementById('futures-list');
    if (!list) return;
    list.innerHTML = '';
    
    let filtered = allAssets;
    if (searchQuery) filtered = allAssets.filter(c => c.symbol.toLowerCase().includes(searchQuery.toLowerCase()));
    
    filtered.forEach(coin => {
        const div = document.createElement('div');
        div.className = 'asset-card';
        div.onclick = () => openFuturesDetail(coin.symbol);
        const change = parseFloat(coin.change_24h);
        const price = parseFloat(coin.price);
        
        div.innerHTML = `
            <div class="coin-left">
                <img src="${getCryptoLogoUrl(coin.symbol)}" class="coin-logo" onerror="handleLogoError(this, '${coin.symbol}')">
                <div class="coin-info">
                    <span class="coin-symbol">${coin.symbol}</span><span class="coin-name">Perpetual</span>
                </div>
            </div>
            <div class="coin-right">
                <div class="price-box"><span class="coin-price">$${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</span></div>
                <div class="change-badge ${change >= 0 ? 'bg-green' : 'bg-red'}">${change > 0 ? '+' : ''}${change.toFixed(2)}%</div>
            </div>
        `;
        list.appendChild(div);
    });
}

function searchFutures(query) { renderFuturesList(query); }

function openFuturesDetail(symbol) {
    currentSymbol = symbol;
    document.getElementById('main-header').style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('futures-detail-view').classList.add('active');
    
    const logoEl = document.getElementById('detail-coin-logo');
    if(logoEl) {
        logoEl.src = getCryptoLogoUrl(symbol);
        logoEl.onerror = function() { handleLogoError(this, symbol); };
    }
    
    document.getElementById('detail-symbol').innerText = `${symbol}/USDT`;
    
    const starBtn = document.getElementById('detail-star-btn');
    starBtn.innerHTML = favorites.includes(symbol) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    
    updateDetailPrices();
    setTimeout(() => initChart(), 100);
    startPriceUpdates();
}

function toggleDetailFavorite() {
    if (!currentSymbol) return;
    const starBtn = document.getElementById('detail-star-btn');
    if (favorites.includes(currentSymbol)) {
        favorites = favorites.filter(s => s !== currentSymbol);
        starBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    } else {
        favorites.push(currentSymbol);
        starBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
    }
    localStorage.setItem('bitnex_favs', JSON.stringify(favorites));
}

function backToFuturesList() {
    stopPriceUpdates();
    document.getElementById('main-header').style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('futures-view').classList.add('active');
    if (tvWidget) { try { tvWidget.remove(); } catch(e) {} tvWidget = null; }
}

function updateDetailPrices() {
    if (!currentSymbol) return;
    const coin = allAssets.find(c => c.symbol === currentSymbol);
    if (!coin) return;
    
    const price = parseFloat(coin.price);
    const change = parseFloat(coin.change_24h);
    const priceChange = (price * change) / 100;
    
    const priceEl = document.getElementById('detail-mark-price');
    if(priceEl) {
        if (previousPrice !== null && previousPrice !== price) {
            priceEl.classList.remove('flash-green', 'flash-red');
            priceEl.classList.add(price > previousPrice ? 'flash-green' : 'flash-red');
            setTimeout(() => priceEl.classList.remove('flash-green', 'flash-red'), 500);
        }
        priceEl.innerText = price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
    }
    
    const tradeEl = document.getElementById('detail-last-trade');
    if(tradeEl) tradeEl.innerText = price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
    previousPrice = price;
    
    const changeEl = document.getElementById('detail-price-change');
    if(changeEl) {
        const sign = change >= 0 ? '+' : '';
        changeEl.innerText = `${sign}${priceChange.toFixed(2)} (${sign}${change.toFixed(2)}%) in 24h`;
        changeEl.className = 'price-change ' + (change >= 0 ? 'positive' : 'negative');
    }
    
    const high24h = parseFloat(coin.high_24h || price * 1.005); 
    const highEl = document.getElementById('detail-24h-high');
    if(highEl) highEl.innerText = high24h.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
    
    const volume = parseFloat(coin.market_cap || 0);
    const volEl = document.getElementById('detail-24h-volume');
    if(volEl) volEl.innerText = (volume / 1000).toFixed(1) + 'K';
}

function startPriceUpdates() {
    stopPriceUpdates();
    priceUpdateInterval = setInterval(() => {
        if (currentSymbol) updateDetailPrices();
    }, 5000); 
}

function stopPriceUpdates() {
    if (priceUpdateInterval) { clearInterval(priceUpdateInterval); priceUpdateInterval = null; }
}

// --- TRADINGVIEW CHART ---
function initChart() {
    if (tvWidget) { try { tvWidget.remove(); } catch(e) {} tvWidget = null; }
    const container = document.getElementById('tradingview_chart');
    if (!container || typeof TradingView === 'undefined') return;
    
    tvWidget = new TradingView.widget({
        "width": "100%",
        "height": "360px",
        "symbol": `BINANCE:${currentSymbol}USDT`,
        "interval": currentTF,
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": currentChartType === 'candles' ? "1" : "2",
        "locale": "en",
        "toolbar_bg": "#000000",
        "enable_publishing": false,
        "backgroundColor": "#000000",
        "allow_symbol_change": false,
        "container_id": "tradingview_chart",
        "hide_side_toolbar": true,
        "hide_top_toolbar": true,
        "hide_legend": true,
        "studies": [],
        "disabled_features": [
            "header_symbol_search", 
            "header_compare", 
            "timeframes_toolbar", 
            "left_toolbar", 
            "control_bar",
            "volume_force_overlay", 
            "create_volume_indicator_by_default",
            "use_localstorage_for_settings",
            "display_market_status",
            "border_around_the_chart"
        ],
        "enabled_features": [],
        "studies_overrides": {
            "volume.volume.color.0": "rgba(0,0,0,0)",
            "volume.volume.color.1": "rgba(0,0,0,0)",
            "volume.volume.transparency": 100,
            "volume.show ma": false
        },
        "overrides": {
            "paneProperties.background": "#000000",
            "paneProperties.vertGridProperties.color": "rgba(0,0,0,0)", 
            "paneProperties.horzGridProperties.color": "rgba(0,0,0,0)", 
            "scalesProperties.textColor": "#888888",
            "scalesProperties.backgroundColor": "#000000",
            "scalesProperties.lineColor": "#000000",
            "mainSeriesProperties.candleStyle.upColor": "#2ebd85",
            "mainSeriesProperties.candleStyle.downColor": "#f6465d",
            "mainSeriesProperties.candleStyle.drawWick": true,
            "mainSeriesProperties.candleStyle.drawBorder": true,
            "mainSeriesProperties.candleStyle.borderColor": "#378658",
            "mainSeriesProperties.candleStyle.borderUpColor": "#2ebd85",
            "mainSeriesProperties.candleStyle.borderDownColor": "#f6465d",
            "mainSeriesProperties.candleStyle.wickUpColor": "#2ebd85",
            "mainSeriesProperties.candleStyle.wickDownColor": "#f6465d"
        }
    });
}

function changeTF(tf, btn) {
    currentTF = tf;
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (tvWidget && currentSymbol) initChart();
}

function changeChartStyle(style, btn) {
    currentChartType = style;
    document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (tvWidget && currentSymbol) initChart();
}

// --- TRADING MODAL & EXECUTION (FUTURES) ---
window.openTradeModal = function(type) {
    currentOrderType = type; 
    document.getElementById('trade-modal').style.display = 'flex';
    document.getElementById('modal-title').innerText = `${currentSymbol}/USDT Perpetual`;
    
    const inputEl = document.getElementById('trade-amount') || document.getElementById('trade-margin');
    if(inputEl) inputEl.value = '';
    
    if (document.getElementById('tp-price')) document.getElementById('tp-price').value = '';
    if (document.getElementById('sl-price')) document.getElementById('sl-price').value = '';
    if (document.getElementById('limit-price')) document.getElementById('limit-price').value = '';
    
    updateMaxSize();
    
    const longBtn = document.getElementById('modal-long-btn');
    const shortBtn = document.getElementById('modal-short-btn');
    if (longBtn && shortBtn) {
        longBtn.style.display = type === 'LONG' ? 'block' : 'none';
        shortBtn.style.display = type === 'SHORT' ? 'block' : 'none';
    }
    
    const executeBtn = document.getElementById('execute-btn');
    if (executeBtn) {
        executeBtn.innerText = `Open ${type}`;
        executeBtn.style.backgroundColor = type === 'LONG' ? 'var(--green)' : 'var(--red)';
        executeBtn.style.color = type === 'LONG' ? 'black' : 'white';
    }
    calculateLiqPrice();
};

window.closeModal = function() { document.getElementById('trade-modal').style.display = 'none'; };
window.closeLeverageModal = function() { document.getElementById('leverage-modal').style.display = 'none'; };
window.toggleLeverageModal = function() { document.getElementById('leverage-modal').style.display = 'flex'; };

function setTradeMode(mode, btn) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function setMarginMode(mode, btn) {
    currentMarginMode = mode;
    document.querySelectorAll('.margin-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    calculateLiqPrice();
}

function toggleTPSL() {
    tpslVisible = !tpslVisible;
    const section = document.getElementById('tpsl-section');
    const btn = document.getElementById('tpsl-btn');
    if(section && btn) {
        section.style.display = tpslVisible ? 'block' : 'none';
        btn.textContent = tpslVisible ? '- TP / SL' : '+ TP / SL';
    }
}

function toggleModeMenu() {
    const btn = document.getElementById('trade-mode-btn');
    const limitSection = document.getElementById('limit-price-section');
    if (currentTradeMode === 'market') {
        currentTradeMode = 'limit';
        if(btn) btn.innerHTML = 'Limit <i class="fa-solid fa-chevron-down"></i>';
        if(limitSection) limitSection.style.display = 'block';
    } else {
        currentTradeMode = 'market';
        if(btn) btn.innerHTML = 'Market <i class="fa-solid fa-chevron-down"></i>';
        if(limitSection) limitSection.style.display = 'none';
    }
    calculateLiqPrice();
}

function updateLeverage(value) {
    currentLeverage = parseInt(value);
    const levBig = document.getElementById('leverage-val-big');
    if(levBig) levBig.textContent = `x${value}`;
    const levVal = document.getElementById('leverage-val');
    if(levVal) levVal.innerText = `x${value}`;
}

function confirmLeverage() {
    const levDisplay = document.getElementById('leverage-display');
    if(levDisplay) levDisplay.innerHTML = `${currentLeverage}x <i class="fa-solid fa-chevron-down"></i>`;
    closeLeverageModal();
    updateMaxSize();
    calculateLiqPrice();
}

function updateMaxSize() {
    const balEl = document.getElementById('main-balance');
    if(!balEl) return;
    const balance = parseFloat(balEl.innerText.replace(/,/g, '')) || 0;
    const maxSize = balance * currentLeverage;
    
    const maxEl = document.getElementById('max-size');
    const avblEl = document.getElementById('avbl-margin');
    if(maxEl) maxEl.textContent = maxSize.toFixed(2) + ' USDT';
    if(avblEl) avblEl.textContent = balance.toFixed(2) + ' USDT';
}

function calculateLiqPrice() {
    const inputEl = document.getElementById('trade-amount') || document.getElementById('trade-margin');
    if(!inputEl) return;
    const inputValue = parseFloat(inputEl.value) || 0;
    
    const liqEl = document.getElementById('liq-price');
    if(!liqEl) return;

    if (inputValue === 0) { liqEl.textContent = '--'; return; }
    
    const coin = allAssets.find(c => c.symbol === currentSymbol);
    if (!coin) return;
    
    const balance = parseFloat(document.getElementById('main-balance').innerText.replace(/,/g, '')) || 0;

    let amount;
    if (inputEl.id === 'trade-margin') {
        amount = inputValue * currentLeverage;
    } else {
        amount = inputValue;
    }

    let entryPrice;
    if (currentTradeMode === 'limit') {
        entryPrice = parseFloat(document.getElementById('limit-price').value) || parseFloat(coin.price);
    } else {
        entryPrice = parseFloat(coin.price);
    }

    const size = amount / entryPrice;
    let liq = 0;

    if (currentMarginMode === 'cross') {
        if (currentOrderType === 'LONG') liq = entryPrice - (balance / size);
        else liq = entryPrice + (balance / size);
    } else {
        if (currentOrderType === 'LONG') liq = entryPrice * (1 - (1 / currentLeverage) + 0.005);
        else liq = entryPrice * (1 + (1 / currentLeverage) - 0.005);
    }

    if (liq <= 0) liqEl.textContent = '--';
    else liqEl.textContent = liq.toFixed(2);
}

document.addEventListener('DOMContentLoaded', function() {
    const inputEl = document.getElementById('trade-amount') || document.getElementById('trade-margin');
    if (inputEl) inputEl.addEventListener('input', calculateLiqPrice);
    
    const limitInput = document.getElementById('limit-price');
    if (limitInput) limitInput.addEventListener('input', calculateLiqPrice);
});

async function executeFutures() {
    const inputEl = document.getElementById('trade-amount') || document.getElementById('trade-margin');
    if(!inputEl) return;
    const inputValue = parseFloat(inputEl.value);
    
    if (!inputValue || inputValue <= 0) {
        showAlert('Error', 'Please enter amount', 'fa-circle-xmark');
        return;
    }
    
    const balanceEl = document.getElementById('main-balance');
    const balance = parseFloat(balanceEl.innerText.replace(/,/g, ''));
    
    let margin, amount;
    if (inputEl.id === 'trade-margin') {
        margin = inputValue;
        amount = margin * currentLeverage;
    } else {
        amount = inputValue;
        margin = amount / currentLeverage;
    }
    
    if (margin > balance) {
        showAlert('Error', 'Insufficient balance!', 'fa-circle-xmark');
        return;
    }
    
    const coin = allAssets.find(c => c.symbol === currentSymbol);
    if (!coin) return;
    
    let entryPrice;
    if (currentTradeMode === 'limit') {
        const limitPriceEl = document.getElementById('limit-price');
        const limitPrice = limitPriceEl ? parseFloat(limitPriceEl.value) : 0;
        if (!limitPrice || limitPrice <= 0) {
            showAlert('Error', 'Please enter limit price', 'fa-circle-xmark');
            return;
        }
        entryPrice = limitPrice;
    } else {
        entryPrice = parseFloat(coin.price);
    }
    
    const tpEl = document.getElementById('tp-price');
    const slEl = document.getElementById('sl-price');
    const tp = tpEl ? parseFloat(tpEl.value) : null;
    const sl = slEl ? parseFloat(slEl.value) : null;
    
    const size = amount / entryPrice;
    let liqPrice = 0;
    if (currentMarginMode === 'cross') {
        if (currentOrderType === 'LONG') liqPrice = entryPrice - (balance / size);
        else liqPrice = entryPrice + (balance / size);
    } else {
        if (currentOrderType === 'LONG') liqPrice = entryPrice * (1 - (1 / currentLeverage) + 0.005);
        else liqPrice = entryPrice * (1 + (1 / currentLeverage) - 0.005);
    }
    if (liqPrice < 0) liqPrice = 0;
    
    const position = {
        id: Date.now(),
        symbol: currentSymbol,
        type: currentOrderType,
        amount: amount,
        leverage: currentLeverage,
        entryPrice: entryPrice,
        currentPrice: parseFloat(coin.price),
        margin: margin,
        liquidationPrice: liqPrice,
        tp: tp,
        sl: sl,
        pnl: 0,
        pnlPercent: 0,
        roi: 0,
        marginRatio: 100,
        openTime: new Date().toISOString(),
        mode: currentTradeMode,
        marginMode: currentMarginMode,
        isPending: currentTradeMode === 'limit'
    };
    
    let positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    positions.push(position);
    localStorage.setItem('bitnex_positions', JSON.stringify(positions));
    
    const newBalance = balance - margin;
    balanceEl.textContent = newBalance.toFixed(2);
    localStorage.setItem('bitnex_balance', newBalance);
    
    closeModal();
    
    if (position.isPending) {
        showAlert('Success', `Limit ${currentOrderType} order placed!\nTarget: $${entryPrice.toFixed(2)}\nAmount: ${amount.toFixed(2)} USDT`, 'fa-clock');
    } else {
        showAlert('Success', `Market ${currentOrderType} opened!\nEntry: $${entryPrice.toFixed(2)}\nAmount: ${amount.toFixed(2)} USDT`, 'fa-circle-check');
    }
    
    loadPositions();
}

function updatePositionsRealTime() {
    let positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    if (positions.length === 0) return;

    let needsRender = false;

    positions.forEach(pos => {
        const coin = allAssets.find(c => c.symbol === pos.symbol);
        if (coin) {
            pos.currentPrice = parseFloat(coin.price);
            
            if (pos.isPending) {
                if ((pos.type === 'LONG' && pos.currentPrice <= pos.entryPrice) ||
                    (pos.type === 'SHORT' && pos.currentPrice >= pos.entryPrice)) {
                    pos.isPending = false; 
                    needsRender = true;
                    showAlert('Order Filled', `${pos.symbol} Limit ${pos.type} executed at $${pos.entryPrice}`, 'fa-bolt');
                }
            }

            if (!pos.isPending) {
                if (pos.type === 'LONG') pos.pnl = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * pos.amount;
                else pos.pnl = ((pos.entryPrice - pos.currentPrice) / pos.entryPrice) * pos.amount;
                
                pos.roi = (pos.pnl / pos.margin) * 100;
                
                if (pos.marginMode === 'cross') {
                    const balance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
                    pos.marginRatio = (pos.margin / (balance + pos.pnl)) * 100;
                } else {
                    pos.marginRatio = ((pos.margin + pos.pnl) / pos.margin) * 100;
                }

                if (pos.tp && pos.type === 'LONG' && pos.currentPrice >= pos.tp) closePositionSilently(pos.id, 'Take Profit');
                if (pos.sl && pos.type === 'LONG' && pos.currentPrice <= pos.sl) closePositionSilently(pos.id, 'Stop Loss');
                if (pos.tp && pos.type === 'SHORT' && pos.currentPrice <= pos.tp) closePositionSilently(pos.id, 'Take Profit');
                if (pos.sl && pos.type === 'SHORT' && pos.currentPrice >= pos.sl) closePositionSilently(pos.id, 'Stop Loss');
            }
        }
    });

    localStorage.setItem('bitnex_positions', JSON.stringify(positions));
    
    const assetsView = document.getElementById('assets-view');
    const futuresViewList = document.getElementById('positions-list');
    if ((assetsView && assetsView.classList.contains('active')) || (futuresViewList && futuresViewList.offsetParent !== null)) {
        loadPositions(); 
    }
}

function closePositionSilently(positionId, reason) {
    let positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    const position = positions.find(p => p.id === positionId);
    if (!position) return;
    
    const balanceEl = document.getElementById('main-balance');
    const balance = parseFloat(balanceEl.innerText.replace(/,/g, ''));
    const newBalance = balance + position.margin + position.pnl;
    
    balanceEl.textContent = newBalance.toFixed(2);
    localStorage.setItem('bitnex_balance', newBalance);
    
    positions = positions.filter(p => p.id !== positionId);
    localStorage.setItem('bitnex_positions', JSON.stringify(positions));
    
    showAlert('Position Closed', `${position.symbol} closed via ${reason}.\nPnL: ${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} USDT`, 'fa-circle-check');
    loadPositions();
}

function editPositionTPSL(positionId) {
    let positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    const position = positions.find(p => p.id === positionId);
    if (!position) return;

    editingPositionId = positionId;
    document.getElementById('edit-tp-input').value = position.tp || '';
    document.getElementById('edit-sl-input').value = position.sl || '';
    document.getElementById('tpsl-edit-modal').style.display = 'flex';
}

window.closeTPModal = function() {
    document.getElementById('tpsl-edit-modal').style.display = 'none';
    editingPositionId = null;
};

function saveTPSL() {
    if (!editingPositionId) return;
    
    let positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    const posIndex = positions.findIndex(p => p.id === editingPositionId);
    
    if (posIndex !== -1) {
        const tpVal = parseFloat(document.getElementById('edit-tp-input').value);
        const slVal = parseFloat(document.getElementById('edit-sl-input').value);
        
        positions[posIndex].tp = isNaN(tpVal) ? null : tpVal;
        positions[posIndex].sl = isNaN(slVal) ? null : slVal;
        
        localStorage.setItem('bitnex_positions', JSON.stringify(positions));
        loadPositions();
        showAlert('Success', 'TP/SL updated successfully!', 'fa-check');
    }
    closeTPModal();
}

function closePosition(positionId) {
    let positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    const position = positions.find(p => p.id === positionId);
    
    if (!position) return;
    
    const actionText = position.isPending ? 'Cancel order' : 'Close position';
    const msg = position.isPending 
        ? `Are you sure you want to cancel this order?` 
        : `Close ${position.symbol}?\n\nPnL: ${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} USDT`;

    showConfirm(actionText, msg, () => {
        const balanceEl = document.getElementById('main-balance');
        const balance = parseFloat(balanceEl.innerText.replace(/,/g, ''));
        const newBalance = balance + position.margin + (position.isPending ? 0 : position.pnl);
        
        balanceEl.textContent = newBalance.toFixed(2);
        localStorage.setItem('bitnex_balance', newBalance);
        
        positions = positions.filter(p => p.id !== positionId);
        localStorage.setItem('bitnex_positions', JSON.stringify(positions));
        
        loadPositions();
        showAlert('Success', `${actionText} successful!\n${position.isPending ? 'Margin refunded.' : `PnL: ${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} USDT`}`, 'fa-circle-check');
    });
}

// ===== ASSETS VIEW (SPOT & FUTURES COMBINED RENDER) =====
function loadPositions() {
    const assetsView = document.getElementById('assets-view');
    if (!assetsView) return;

    // 1. RENDER SPOT ASSETS
    let spotContainer = document.getElementById('spot-balances-container');
    if (!spotContainer) {
        spotContainer = document.createElement('div');
        spotContainer.id = 'spot-balances-container';
        const pageHeader = assetsView.querySelector('.page-header');
        if (pageHeader) pageHeader.after(spotContainer);
        else assetsView.appendChild(spotContainer);
    }
    
    let spotHtml = '';
    let totalSpotValue = 0;
    let hasSpot = false;

    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('bitnex_spot_')) {
            const symbol = key.replace('bitnex_spot_', '');
            const amount = parseFloat(localStorage.getItem(key));
            if (amount > 0) {
                hasSpot = true;
                const coin = allAssets.find(c => c.symbol === symbol);
                const currentPrice = coin ? parseFloat(coin.price) : 0;
                const valueUsdt = amount * currentPrice;
                totalSpotValue += valueUsdt;

                spotHtml += `
                <div style="background:#141414; border:1px solid #333; border-radius:16px; padding:16px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${getCryptoLogoUrl(symbol)}" style="width:36px; height:36px; border-radius:50%;" onerror="handleLogoError(this, '${symbol}')">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <span style="font-size:16px; font-weight:700; color:#fff;">${symbol}</span>
                            <span style="font-size:12px; color:#888; background:#1E2026; padding:2px 6px; border-radius:4px; width:fit-content;">Spot</span>
                        </div>
                    </div>
                    <div style="text-align:right; display:flex; flex-direction:column; gap:4px;">
                        <div style="font-size:16px; font-weight:700; color:#fff;">${amount.toFixed(6)}</div>
                        <div style="font-size:13px; color:#888;">~ $${valueUsdt.toFixed(2)}</div>
                    </div>
                </div>
                `;
            }
        }
    }
    
    if (hasSpot) {
        spotContainer.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin: 24px 0 16px 0;"><h3 style="font-size:18px;color:#fff;margin:0;">Spot Wallet</h3><span style="color:var(--accent); font-weight:700; font-size:15px;">~ $${totalSpotValue.toFixed(2)}</span></div>` + spotHtml;
    } else {
        spotContainer.innerHTML = `<h3 style="margin:24px 0 16px 0;font-size:18px;color:#fff;">Spot Wallet</h3><p style="text-align:center;color:#666;margin:20px 0;background:#141414;padding:20px;border-radius:16px;border:1px dashed #333;">No spot assets yet</p>`;
    }

    // 2. RENDER FUTURES POSITIONS
    let futuresContainer = document.getElementById('positions-container');
    if (!futuresContainer) {
        futuresContainer = document.createElement('div');
        futuresContainer.id = 'positions-container';
        futuresContainer.style.marginTop = '20px';
        assetsView.appendChild(futuresContainer);
    }

    const positions = JSON.parse(localStorage.getItem('bitnex_positions')) || [];
    
    if (positions.length === 0) {
        futuresContainer.innerHTML = '<h3 style="margin-bottom:16px;font-size:18px;color:#fff;margin-top:24px;">Futures Positions</h3><p style="text-align:center;color:#666;margin:20px 0;background:#141414;padding:20px;border-radius:16px;border:1px dashed #333;">No open positions</p>';
        return;
    }
    
    let html = '<h3 style="margin-bottom:16px;font-size:18px;color:#fff;margin-top:24px;">Futures Positions</h3>';
    
    positions.forEach(pos => {
        const pnlColor = pos.pnl >= 0 ? '#2EBD85' : '#F6465D';
        const roiColor = pos.roi >= 0 ? '#2EBD85' : '#F6465D';
        const typeColor = pos.type === 'LONG' ? '#2EBD85' : '#F6465D';
        
        const pendingBadge = pos.isPending ? `<span style="font-size:12px;font-weight:700;color:#F0B90B;padding:2px 6px;border-radius:4px;background:rgba(240,185,11,0.1);margin-left:8px;">PENDING LIMIT</span>` : '';
        const marginModeText = pos.marginMode === 'cross' ? 'Cross' : 'Isolated';
        const liqText = (pos.isPending || pos.liquidationPrice <= 0) ? '--' : pos.liquidationPrice.toLocaleString();
        
        let tpslText = '';
        if (pos.tp || pos.sl) {
            tpslText = `<div style="font-size: 12px; color: #888; margin-top: 10px; border-top: 1px dashed #333; padding-top: 10px;">
                TP: ${pos.tp ? pos.tp : '--'} / SL: ${pos.sl ? pos.sl : '--'}
            </div>`;
        }

        html += `
        <div style="background:#141414;border:1px solid #333; border-radius:16px;padding:20px;margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                    <img src="${getCryptoLogoUrl(pos.symbol)}" style="width:32px;height:32px;border-radius:50%;flex-shrink:0;" alt="${pos.symbol}" onerror="handleLogoError(this, '${pos.symbol}')">
                    <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:18px;font-weight:700;color:#fff;">${pos.symbol}USDT</span>
                            <span style="font-size:12px;font-weight:700;color:${typeColor};padding:2px 6px;border-radius:4px;background:rgba(255,255,255,0.1);">${pos.type}</span>
                        </div>
                        ${pendingBadge ? `<span style="font-size:11px;font-weight:700;color:#F0B90B;padding:2px 6px;border-radius:4px;background:rgba(240,185,11,0.1);width:fit-content;">PENDING LIMIT</span>` : ''}
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0;">
                    <span style="font-size:12px;color:#888;padding:4px 8px;background:#1E2026;border-radius:6px;white-space:nowrap;">${marginModeText}</span>
                    <span style="font-size:13px;font-weight:700;color:#F0B90B;padding:4px 8px;background:rgba(240,185,11,0.1);border-radius:6px;">${pos.leverage}X</span>
                </div>
            </div>
            
            <div style="display:flex;gap:40px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #333;">
                <div style="flex:1;">
                    <div style="font-size:12px;color:#888;margin-bottom:4px;">Unrealized PNL (USDT)</div>
                    <div style="font-size:24px;font-weight:700;color:${pos.isPending ? '#888' : pnlColor};">${pos.isPending ? '0.00' : (pos.pnl >= 0 ? '+' : '') + pos.pnl.toFixed(2)}</div>
                </div>
                <div style="flex:1;">
                    <div style="font-size:12px;color:#888;margin-bottom:4px;">ROI</div>
                    <div style="font-size:24px;font-weight:700;color:${pos.isPending ? '#888' : roiColor};">${pos.isPending ? '0.00' : (pos.roi >= 0 ? '+' : '') + pos.roi.toFixed(2)}%</div>
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;margin-bottom:20px;">
                <div>
                    <div style="font-size:12px;color:#888;">Size (${pos.symbol})</div>
                    <div style="font-size:15px;font-weight:600;color:#fff;">${(pos.amount / pos.entryPrice).toFixed(4)}</div>
                </div>
                <div>
                    <div style="font-size:12px;color:#888;">Margin (USDT)</div>
                    <div style="font-size:15px;font-weight:600;color:#fff;">${pos.margin.toFixed(2)}</div>
                </div>
                <div>
                    <div style="font-size:12px;color:#888;">${pos.isPending ? 'Trigger Price' : 'Entry Price'}</div>
                    <div style="font-size:15px;font-weight:600;color:#fff;">${pos.entryPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div style="font-size:12px;color:#888;">Mark Price</div>
                    <div style="font-size:15px;font-weight:600;color:#fff;">${pos.currentPrice.toLocaleString()}</div>
                </div>
                <div>
                    <div style="font-size:12px;color:#888;">Liq. Price</div>
                    <div style="font-size:15px;font-weight:600;color:${pos.isPending ? '#888' : '#F6465D'};">${liqText}</div>
                </div>
            </div>
            
            ${tpslText}

            <div class="bybit-action-buttons">
                <button class="bybit-action-btn" onclick="editPositionTPSL(${pos.id})">TP/SL</button>
                <button class="bybit-action-btn btn-close" onclick="closePosition(${pos.id})">${pos.isPending ? 'Cancel' : 'Close'}</button>
            </div>
        </div>
        `;
    });
    futuresContainer.innerHTML = html;
}

window.switchTab = function(tab) {
    const mainHeader = document.getElementById('main-header');
    if (mainHeader) {
        mainHeader.style.display = tab === 'futures' ? 'none' : 'flex';
    }
    
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    
    const tabEl = document.getElementById(`${tab}-view`);
    if (tabEl) tabEl.classList.add('active');
    
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    if(tab === 'home') fetchMarketData();
    if(tab === 'trade') {
        fetchMarketData();
        renderSpotList();
    }
    if(tab === 'futures') {
        fetchMarketData();
        if (tvWidget) {
            tvWidget.remove();
            tvWidget = null;
        }
    }
    if (tab === 'assets') {
        setTimeout(() => loadPositions(), 100);
    }
};

// ===== SPOT FUNCTIONS =====
let currentSpotSymbol = null;
let spotTvWidget = null;
let currentSpotTF = 'D';
let currentSpotChartType = 'candles';
let spotPriceUpdateInterval = null;
let spotPreviousPrice = null;

function openSpotDetail(symbol) {
    currentSpotSymbol = symbol;
    document.getElementById('main-header').style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('spot-detail-view').classList.add('active');
    
    const logoEl = document.getElementById('spot-detail-coin-logo');
    if(logoEl) {
        logoEl.src = getCryptoLogoUrl(symbol);
        logoEl.onerror = function() { handleLogoError(this, symbol); };
    }
    
    document.getElementById('spot-detail-symbol').innerText = `${symbol}/USDT`;
    
    const starBtn = document.getElementById('spot-detail-star-btn');
    starBtn.innerHTML = favorites.includes(symbol) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
    
    updateSpotDetailPrices();
    setTimeout(() => initSpotChart(), 100);
    startSpotPriceUpdates();
}

function toggleSpotDetailFavorite() {
    if (!currentSpotSymbol) return;
    const starBtn = document.getElementById('spot-detail-star-btn');
    if (favorites.includes(currentSpotSymbol)) {
        favorites = favorites.filter(s => s !== currentSpotSymbol);
        starBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    } else {
        favorites.push(currentSpotSymbol);
        starBtn.innerHTML = '<i class="fa-solid fa-star"></i>';
    }
    localStorage.setItem('bitnex_favs', JSON.stringify(favorites));
}

function backToSpotList() {
    stopSpotPriceUpdates();
    document.getElementById('main-header').style.display = 'flex';
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('trade-view').classList.add('active');
    if (spotTvWidget) { try { spotTvWidget.remove(); } catch(e) {} spotTvWidget = null; }
}

function updateSpotDetailPrices() {
    if (!currentSpotSymbol) return;
    const coin = allAssets.find(c => c.symbol === currentSpotSymbol);
    if (!coin) return;
    
    const price = parseFloat(coin.price);
    const change = parseFloat(coin.change_24h);
    const priceChange = (price * change) / 100;
    
    const priceEl = document.getElementById('spot-detail-mark-price');
    if(priceEl) {
        if (spotPreviousPrice !== null && spotPreviousPrice !== price) {
            priceEl.classList.remove('flash-green', 'flash-red');
            priceEl.classList.add(price > spotPreviousPrice ? 'flash-green' : 'flash-red');
            setTimeout(() => priceEl.classList.remove('flash-green', 'flash-red'), 500);
        }
        priceEl.innerText = price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
    }
    
    const tradeEl = document.getElementById('spot-detail-last-trade');
    if(tradeEl) tradeEl.innerText = price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
    spotPreviousPrice = price;
    
    const changeEl = document.getElementById('spot-detail-price-change');
    if(changeEl) {
        const sign = change >= 0 ? '+' : '';
        changeEl.innerText = `${sign}${priceChange.toFixed(2)} (${sign}${change.toFixed(2)}%) in 24h`;
        changeEl.className = 'price-change ' + (change >= 0 ? 'positive' : 'negative');
    }
    
    const high24h = parseFloat(coin.high_24h || price * 1.005); 
    const highEl = document.getElementById('spot-detail-24h-high');
    if(highEl) highEl.innerText = high24h.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6});
    
    const volume = parseFloat(coin.market_cap || 0);
    const volEl = document.getElementById('spot-detail-24h-volume');
    if(volEl) volEl.innerText = (volume / 1000).toFixed(1) + 'K';
}

function startSpotPriceUpdates() {
    stopSpotPriceUpdates();
    spotPriceUpdateInterval = setInterval(() => {
        if (currentSpotSymbol) updateSpotDetailPrices();
    }, 5000); 
}

function stopSpotPriceUpdates() {
    if (spotPriceUpdateInterval) { clearInterval(spotPriceUpdateInterval); spotPriceUpdateInterval = null; }
}

function initSpotChart() {
    if (spotTvWidget) { try { spotTvWidget.remove(); } catch(e) {} spotTvWidget = null; }
    const container = document.getElementById('spot_tradingview_chart');
    if (!container || typeof TradingView === 'undefined') return;
    
    spotTvWidget = new TradingView.widget({
        "width": "100%",
        "height": "360px",
        "symbol": `BINANCE:${currentSpotSymbol}USDT`,
        "interval": currentSpotTF,
        "timezone": "Etc/UTC",
        "theme": "dark",
        "style": currentSpotChartType === 'candles' ? "1" : "2",
        "locale": "en",
        "toolbar_bg": "#000000",
        "enable_publishing": false,
        "backgroundColor": "#000000",
        "allow_symbol_change": false,
        "container_id": "spot_tradingview_chart",
        "hide_side_toolbar": true,
        "hide_top_toolbar": true,
        "hide_legend": true,
        "studies": [],
        "disabled_features": [
            "header_symbol_search", 
            "header_compare", 
            "timeframes_toolbar", 
            "left_toolbar", 
            "control_bar",
            "volume_force_overlay", 
            "create_volume_indicator_by_default",
            "use_localstorage_for_settings",
            "display_market_status",
            "border_around_the_chart"
        ],
        "enabled_features": [],
        "studies_overrides": {
            "volume.volume.color.0": "rgba(0,0,0,0)",
            "volume.volume.color.1": "rgba(0,0,0,0)",
            "volume.volume.transparency": 100,
            "volume.show ma": false
        },
        "overrides": {
            "paneProperties.background": "#000000",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": "rgba(0,0,0,0)", 
            "paneProperties.horzGridProperties.color": "rgba(0,0,0,0)", 
            "scalesProperties.textColor": "#888888",
            "scalesProperties.backgroundColor": "#000000",
            "scalesProperties.lineColor": "#000000",
            "mainSeriesProperties.candleStyle.upColor": "#2ebd85",
            "mainSeriesProperties.candleStyle.downColor": "#f6465d",
            "mainSeriesProperties.candleStyle.drawWick": true,
            "mainSeriesProperties.candleStyle.drawBorder": true,
            "mainSeriesProperties.candleStyle.borderColor": "#378658",
            "mainSeriesProperties.candleStyle.borderUpColor": "#2ebd85",
            "mainSeriesProperties.candleStyle.borderDownColor": "#f6465d",
            "mainSeriesProperties.candleStyle.wickUpColor": "#2ebd85",
            "mainSeriesProperties.candleStyle.wickDownColor": "#f6465d"
        }
    });
}

function changeSpotTF(tf, btn) {
    currentSpotTF = tf;
    document.querySelectorAll('#spot-detail-view .tf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (spotTvWidget && currentSpotSymbol) initSpotChart();
}

function changeSpotChartStyle(style, btn) {
    currentSpotChartType = style;
    document.querySelectorAll('#spot-detail-view .chart-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (spotTvWidget && currentSpotSymbol) initSpotChart();
}

function renderSpotList() {
    const list = document.getElementById('spot-list');
    if (!list) return;
    list.innerHTML = '';
    
    allAssets.forEach(coin => {
        const div = document.createElement('div');
        div.className = 'asset-card';
        div.onclick = () => openSpotDetail(coin.symbol);
        const change = parseFloat(coin.change_24h);
        const price = parseFloat(coin.price);
        
        div.innerHTML = `
            <div class="coin-left">
                <img src="${getCryptoLogoUrl(coin.symbol)}" class="coin-logo" onerror="handleLogoError(this, '${coin.symbol}')">
                <div class="coin-info">
                    <span class="coin-symbol">${coin.symbol}</span>
                    <span class="coin-name">${coin.name}</span>
                </div>
            </div>
            <div class="coin-right">
                <div class="price-box"><span class="coin-price">$${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</span></div>
                <div class="change-badge ${change >= 0 ? 'bg-green' : 'bg-red'}">${change > 0 ? '+' : ''}${change.toFixed(2)}%</div>
            </div>
        `;
        list.appendChild(div);
    });
}

window.updateSpotExpectedOutput = function() {
    const inputEl = document.getElementById('spot-trade-amount');
    const outputEl = document.getElementById('spot-expected-output');
    if(!inputEl || !outputEl) return;

    const amount = parseFloat(inputEl.value) || 0;
    if(amount <= 0) {
        outputEl.innerText = '0.00';
        return;
    }

    const coin = allAssets.find(c => c.symbol === currentSpotSymbol);
    if(!coin) return;

    let executePrice = parseFloat(coin.price);
    if (currentSpotTradeMode === 'limit') {
        const limitPriceEl = document.getElementById('spot-limit-price');
        if(limitPriceEl && parseFloat(limitPriceEl.value) > 0) {
            executePrice = parseFloat(limitPriceEl.value);
        }
    }

    if (executePrice <= 0) return;

    const feeRate = 0.001; // 0.1% Комісія
    
    if(currentSpotOrderType === 'BUY') {
        const coins = (amount / executePrice) * (1 - feeRate);
        outputEl.innerText = `${coins.toFixed(6)} ${currentSpotSymbol} (Fee: 0.1%)`;
    } else {
        const coinsToSell = amount / executePrice;
        const usdtReceived = amount * (1 - feeRate);
        outputEl.innerText = `Sell ${coinsToSell.toFixed(6)} ${currentSpotSymbol} -> Get ${usdtReceived.toFixed(2)} USDT`;
    }
};

window.openSpotTradeModal = function(type) {
    currentSpotOrderType = type; 
    const modal = document.getElementById('spot-trade-modal');
    if(!modal) return;
    
    document.getElementById('spot-modal-title').innerText = `${currentSpotSymbol}/USDT Spot`;
    
    const inputEl = document.getElementById('spot-trade-amount');
    if(inputEl) inputEl.value = '';
    
    const limitEl = document.getElementById('spot-limit-price');
    if(limitEl) limitEl.value = '';
    
    const expectedEl = document.getElementById('spot-expected-output');
    if(expectedEl) expectedEl.innerText = '0.00';
    
    const bal = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
    let coinBalance = parseFloat(localStorage.getItem(`bitnex_spot_${currentSpotSymbol}`)) || 0;
    
    const avblEl = document.getElementById('spot-avbl-balance');
    if (avblEl) {
        if (type === 'BUY') {
            avblEl.innerText = `${bal.toFixed(2)} USDT`;
        } else {
            avblEl.innerText = `${coinBalance.toFixed(6)} ${currentSpotSymbol}`;
        }
    }
    
    const buyBtn = document.getElementById('spot-modal-buy-btn');
    const sellBtn = document.getElementById('spot-modal-sell-btn');
    
    if (buyBtn && sellBtn) {
        if (type === 'BUY') {
            buyBtn.style.display = 'block';
            sellBtn.style.display = 'none';
            buyBtn.innerText = `Buy ${currentSpotSymbol}`;
        } else {
            buyBtn.style.display = 'none';
            sellBtn.style.display = 'block';
            sellBtn.innerText = `Sell ${currentSpotSymbol}`;
        }
    }
    
    modal.style.display = 'flex';
};

window.closeSpotTradeModal = function() { 
    document.getElementById('spot-trade-modal').style.display = 'none'; 
};

window.toggleSpotModeMenu = function() {
    const btn = document.getElementById('spot-trade-mode-btn');
    const limitSection = document.getElementById('spot-limit-price-section');
    if (currentSpotTradeMode === 'market') {
        currentSpotTradeMode = 'limit';
        if(btn) btn.innerHTML = 'Limit <i class="fa-solid fa-chevron-down"></i>';
        if(limitSection) limitSection.style.display = 'block';
    } else {
        currentSpotTradeMode = 'market';
        if(btn) btn.innerHTML = 'Market <i class="fa-solid fa-chevron-down"></i>';
        if(limitSection) limitSection.style.display = 'none';
    }
    updateSpotExpectedOutput();
};

window.executeSpotTrade = async function(type) {
    const amountInput = document.getElementById('spot-trade-amount');
    if(!amountInput) return;
    const amount = parseFloat(amountInput.value);
    
    if (!amount || amount <= 0) {
        showAlert('Error', 'Please enter a valid amount', 'fa-circle-xmark');
        return;
    }
    
    const coin = allAssets.find(c => c.symbol === currentSpotSymbol);
    if (!coin) return;
    
    let executePrice = parseFloat(coin.price);
    if (currentSpotTradeMode === 'limit') {
        const limitPriceEl = document.getElementById('spot-limit-price');
        const limitPrice = limitPriceEl ? parseFloat(limitPriceEl.value) : 0;
        if (!limitPrice || limitPrice <= 0) {
            showAlert('Error', 'Please enter limit price', 'fa-circle-xmark');
            return;
        }
        executePrice = limitPrice;
    }
    
    if (executePrice <= 0) return;
    
    let usdtBalance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
    let coinBalance = parseFloat(localStorage.getItem(`bitnex_spot_${currentSpotSymbol}`)) || 0;
    const feeRate = 0.001; // 0.1%
    
    if (type === 'BUY') {
        if (amount > usdtBalance) {
            showAlert('Error', 'Insufficient USDT balance!', 'fa-circle-xmark');
            return;
        }
        
        const coinsToBuy = (amount / executePrice) * (1 - feeRate);
        usdtBalance -= amount;
        coinBalance += coinsToBuy;
        
        localStorage.setItem('bitnex_balance', usdtBalance);
        localStorage.setItem(`bitnex_spot_${currentSpotSymbol}`, coinBalance);
        
        let msg = currentSpotTradeMode === 'limit' 
            ? `Limit order placed to Buy ${coinsToBuy.toFixed(4)} ${currentSpotSymbol} at $${executePrice.toFixed(2)}.`
            : `Successfully bought ${coinsToBuy.toFixed(4)} ${currentSpotSymbol} for ${amount} USDT!`;
        
        showAlert('Success', msg, 'fa-circle-check');
    } else {
        const coinsToSell = amount / executePrice;
        if (coinsToSell > coinBalance) {
            showAlert('Error', `Insufficient ${currentSpotSymbol} balance! You have ${coinBalance.toFixed(6)} ${currentSpotSymbol}.`, 'fa-circle-xmark');
            return;
        }
        
        const usdtReceived = amount * (1 - feeRate);
        usdtBalance += usdtReceived;
        coinBalance -= coinsToSell;
        
        localStorage.setItem('bitnex_balance', usdtBalance);
        localStorage.setItem(`bitnex_spot_${currentSpotSymbol}`, coinBalance);
        
        let msg = currentSpotTradeMode === 'limit' 
            ? `Limit order placed to Sell ${coinsToSell.toFixed(4)} ${currentSpotSymbol} at $${executePrice.toFixed(2)}.`
            : `Successfully sold ${coinsToSell.toFixed(4)} ${currentSpotSymbol} and received ${usdtReceived.toFixed(2)} USDT!`;
        
        showAlert('Success', msg, 'fa-circle-check');
    }
    
    closeSpotTradeModal();
    loadUserData(); 
    loadPositions(); // Оновлює вкладку Assets
};


// ===== AVATAR SYSTEM =====
const AVATARS = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=1&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=2&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=3&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=4&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=5&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=6&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=7&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=8&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=9&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=10&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=11&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=12&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=13&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=14&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=15&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=16&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=17&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=18&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=19&backgroundColor=b6e3f4',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=20&backgroundColor=b6e3f4',
    'https://cdn-icons-png.flaticon.com/512/4140/4140048.png'
];

// Крипто аватарки — логотипи монет
const CRYPTO_AVATARS = [
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/btc.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/eth.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/bnb.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/sol.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/xrp.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/doge.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdt.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ada.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/ltc.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/avax.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/usdc.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/dot.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/link.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/matic.png',
    'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/atom.png',
];

function openAvatarModal() {
    document.getElementById('avatar-modal').style.display = 'flex';
    const grid = document.getElementById('avatars-grid');
    const currentAvatar = localStorage.getItem('bitnex_avatar') || AVATARS[20];

    const renderItems = (list) => list.map((url, i) => {
        const sel = url === currentAvatar;
        return `<div class="avatar-option ${sel ? 'selected' : ''}" onclick="selectAvatar('${url}')">
            <img src="${url}" alt="Avatar ${i + 1}">
            ${sel ? '<div class="avatar-check"><i class="fa-solid fa-check"></i></div>' : ''}
        </div>`;
    }).join('');

    grid.innerHTML = `
        <div class="avatar-section-label">CRYPTO</div>
        ${renderItems(CRYPTO_AVATARS)}
        <div class="avatar-section-label">CLASSIC</div>
        ${renderItems(AVATARS)}
    `;
}

function selectAvatar(url) {
    localStorage.setItem('bitnex_avatar', url);
    document.getElementById('user-avatar-img').src = url;
    closeAvatarModal();
    showAlert('Success', 'Avatar updated!', 'fa-circle-check');
}

function closeAvatarModal() {
    document.getElementById('avatar-modal').style.display = 'none';
}

function loadUserAvatar() {
    const savedAvatar = localStorage.getItem('bitnex_avatar');
    if (savedAvatar) {
        document.getElementById('user-avatar-img').src = savedAvatar;
    }
}

// ===== SEARCH SYSTEM =====
function openSearchModal() {
    document.getElementById('search-modal').style.display = 'flex';
    document.getElementById('coin-search-input').value = '';
    setTimeout(() => {
        document.getElementById('coin-search-input').focus();
    }, 100);
    searchCoins('');
}

function closeSearchModal() {
    document.getElementById('search-modal').style.display = 'none';
}

function searchCoins(query) {
    const results = document.getElementById('search-results-list');
    const normalizedQuery = query.toLowerCase().trim();
    
    let filteredCoins = allAssets;
    if (normalizedQuery) {
        filteredCoins = allAssets.filter(coin => 
            coin.symbol.toLowerCase().includes(normalizedQuery) ||
            coin.name.toLowerCase().includes(normalizedQuery)
        );
    }
    
    if (filteredCoins.length === 0) {
        results.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">No coins found</p>';
        return;
    }
    
    let html = '';
    filteredCoins.slice(0, 30).forEach(coin => {
        const change = parseFloat(coin.change_24h);
        const changeColor = change >= 0 ? '#2EBD85' : '#F6465D';
        const price = parseFloat(coin.price);
        
        html += `
        <div style="display: flex; align-items: center; padding: 12px; background: #1E2026; border-radius: 8px; margin-bottom: 8px; cursor: pointer;" onclick="goToCoin('${coin.symbol}')">
            <img src="${getCryptoLogoUrl(coin.symbol)}" style="width: 36px; height: 36px; border-radius: 50%; margin-right: 12px;" onerror="handleLogoError(this, '${coin.symbol}')">
            <div style="flex: 1;">
                <div style="font-size: 16px; font-weight: 600; color: #fff;">${coin.symbol}</div>
                <div style="font-size: 12px; color: #888;">${coin.name}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 15px; font-weight: 600; color: #fff;">$${price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</div>
                <div style="font-size: 13px; font-weight: 600; color: ${changeColor};">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</div>
            </div>
        </div>
        `;
    });
    
    results.innerHTML = html;
}

function goToCoin(symbol) {
    closeSearchModal();
    
    const spotView = document.getElementById('trade-view');
    const futuresView = document.getElementById('futures-view');
    
    if (spotView && spotView.classList.contains('active')) {
        openSpotDetail(symbol);
    } else if (futuresView && futuresView.classList.contains('active')) {
        openFuturesDetail(symbol);
    } else {
        switchTab('futures');
        setTimeout(() => openFuturesDetail(symbol), 100);
    }
}

// Load avatar on page load
document.addEventListener('DOMContentLoaded', () => {
    loadUserAvatar();
});


// ===== SWAP SYSTEM =====
let swapFromCoin = 'USDT';
let swapToCoin = 'BTC';

function openSwapModal() {
    document.getElementById('swap-modal').style.display = 'flex';
    
    // Ініціалізуємо початкові монети
    swapFromCoin = 'USDT';
    swapToCoin = 'BTC';
    
    document.getElementById('swap-from-coin-text').textContent = 'USDT';
    document.getElementById('swap-to-coin-text').textContent = 'BTC';
    
    // Очищаємо поля
    document.getElementById('swap-from-amount').value = '';
    document.getElementById('swap-to-amount').value = '0.0';
    
    updateSwapLogos();
    updateSwapBalances();
    calculateSwapOutput();
}

function closeSwapModal() {
    document.getElementById('swap-modal').style.display = 'none';
}

// ===== SWAP COIN SELECTOR =====
let currentSwapSelectorType = 'from';
let currentSwapTab = 'all';

function openSwapCoinSelector(type) {
    currentSwapSelectorType = type;
    currentSwapTab = 'all';
    
    document.getElementById('swap-coin-selector-modal').style.display = 'flex';
    document.getElementById('swap-selector-title').textContent = type === 'from' ? 'From' : 'To';
    document.getElementById('swap-coin-search').value = '';
    
    // Завжди показуємо таби (All + Holdings)
    const tabsRow = document.getElementById('swap-tabs-row');
    if (tabsRow) tabsRow.style.display = 'flex';
    
    // Reset tabs
    document.querySelectorAll('.swap-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.style.color = '#888';
        tab.style.borderBottomColor = 'transparent';
    });
    const firstTab = document.querySelector('.swap-tab');
    if (firstTab) {
        firstTab.classList.add('active');
        firstTab.style.color = 'var(--accent)';
        firstTab.style.borderBottomColor = 'var(--accent)';
    }
    
    renderSwapCoins();
}

function closeSwapCoinSelector() {
    document.getElementById('swap-coin-selector-modal').style.display = 'none';
}

function switchSwapTab(tab, btn) {
    currentSwapTab = tab;
    
    // Update tabs
    document.querySelectorAll('.swap-tab').forEach(t => {
        t.classList.remove('active');
        t.style.color = '#888';
        t.style.borderBottomColor = 'transparent';
    });
    btn.classList.add('active');
    btn.style.color = 'var(--accent)';
    btn.style.borderBottomColor = 'var(--accent)';
    
    renderSwapCoins();
}

function renderSwapCoins() {
    const container = document.getElementById('swap-coins-list');
    const searchQuery = document.getElementById('swap-coin-search').value.toLowerCase();
    
    let coins = [];
    
    if (currentSwapTab === 'all') {
        // All — показуємо всі монети (і для from, і для to)
        const usdtBal = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
        coins.push({ symbol: 'USDT', balance: usdtBal });
        allAssets.forEach(coin => {
            const balance = parseFloat(localStorage.getItem(`bitnex_spot_${coin.symbol}`)) || 0;
            coins.push({ symbol: coin.symbol, balance: balance });
        });
    } else {
        // Show only holdings
        const usdtBalance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
        if (usdtBalance > 0) {
            coins.push({ symbol: 'USDT', balance: usdtBalance });
        }
        
        allAssets.forEach(coin => {
            const balance = parseFloat(localStorage.getItem(`bitnex_spot_${coin.symbol}`)) || 0;
            if (balance > 0) {
                coins.push({ symbol: coin.symbol, balance: balance });
            }
        });
    }
    
    // Filter by search
    if (searchQuery) {
        coins = coins.filter(c => c.symbol.toLowerCase().includes(searchQuery));
    }
    
    // Render
    let html = '';
    coins.forEach(coin => {
        const logoUrl = getCryptoLogoUrl(coin.symbol);
        const coinName = coin.symbol === 'USDT' ? 'Tether' : (allAssets.find(c => c.symbol === coin.symbol)?.name || coin.symbol);
        
        html += `
            <div class="swap-coin-item" onclick="selectSwapCoin('${coin.symbol}')" style="display: flex; align-items: center; gap: 12px; padding: 12px; cursor: pointer; border-radius: 8px;">
                <img src="${logoUrl}" style="width: 32px; height: 32px; border-radius: 50%;" alt="${coin.symbol}" onerror="this.src=getCryptoLogoUrl('${coin.symbol}')">
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: 600; color: white;">${coin.symbol}</div>
                    <div style="font-size: 12px; color: #888;">${coinName}</div>
                </div>
                ${coin.balance > 0 ? `<div style="font-size: 14px; color: #888;">${coin.balance.toFixed(6)}</div>` : ''}
            </div>
        `;
    });
    
    if (coins.length === 0) {
        html = '<div style="text-align: center; padding: 40px; color: #666;">No coins found</div>';
    }
    
    container.innerHTML = html;
}

function filterSwapCoins() {
    renderSwapCoins();
}

function selectSwapCoin(symbol) {
    if (currentSwapSelectorType === 'from') {
        swapFromCoin = symbol;
        document.getElementById('swap-from-coin-text').textContent = symbol;
        document.getElementById('swap-from-logo').src = getCryptoLogoUrl(symbol);
    } else {
        swapToCoin = symbol;
        document.getElementById('swap-to-coin-text').textContent = symbol;
        document.getElementById('swap-to-logo').src = getCryptoLogoUrl(symbol);
    }
    
    updateSwapBalances();
    closeSwapCoinSelector();
}

function updateSwapBalances() {
    // swapFromCoin та swapToCoin вже встановлені в selectSwapCoin або openSwapModal
    
    const usdtBalance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
    
    // From balance
    let fromBalance = 0;
    if (swapFromCoin === 'USDT') {
        fromBalance = usdtBalance;
    } else {
        fromBalance = parseFloat(localStorage.getItem(`bitnex_spot_${swapFromCoin}`)) || 0;
    }
    document.getElementById('swap-from-balance').textContent = fromBalance.toFixed(6);
    
    // To balance
    let toBalance = 0;
    if (swapToCoin === 'USDT') {
        toBalance = usdtBalance;
    } else {
        toBalance = parseFloat(localStorage.getItem(`bitnex_spot_${swapToCoin}`)) || 0;
    }
    document.getElementById('swap-to-balance').textContent = toBalance.toFixed(6);
    
    updateSwapLogos(); // Оновлюємо логотипи
    calculateSwapOutput();
}

function updateSwapLogos() {
    // swapFromCoin та swapToCoin вже встановлені глобально
    
    const fromLogo = document.getElementById('swap-from-logo');
    const toLogo = document.getElementById('swap-to-logo');
    
    fromLogo.src = getCryptoLogoUrl(swapFromCoin);
    toLogo.src = getCryptoLogoUrl(swapToCoin);
    
    fromLogo.onerror = function() { this.src = getCryptoLogoUrl(swapFromCoin); };
    toLogo.onerror = function() { this.src = getCryptoLogoUrl(swapToCoin); };
}

function calculateSwapOutput() {
    // Ціна USDT завжди 1.0
    let fromPrice = 1.0;
    let toPrice = 1.0;
    
    if (swapFromCoin !== 'USDT') {
        const fromCoin = allAssets.find(c => c.symbol === swapFromCoin);
        if (fromCoin) fromPrice = parseFloat(fromCoin.price);
    }
    
    if (swapToCoin !== 'USDT') {
        const toCoin = allAssets.find(c => c.symbol === swapToCoin);
        if (toCoin) toPrice = parseFloat(toCoin.price);
    }
    
    // Курс завжди відображаємо
    const rate = fromPrice / toPrice;
    const rateStr = rate >= 1 ? rate.toFixed(6) : rate.toFixed(8);
    document.getElementById('swap-rate').textContent = `1 ${swapFromCoin} = ${rateStr} ${swapToCoin}`;
    
    const fromAmount = parseFloat(document.getElementById('swap-from-amount').value) || 0;
    
    if (fromAmount <= 0) {
        document.getElementById('swap-to-amount').value = '';
        return;
    }
    
    // Розрахунок
    const fromValueUSD = fromAmount * fromPrice;
    const fee = fromValueUSD * 0.001; // 0.1%
    const toAmount = (fromValueUSD - fee) / toPrice;
    
    document.getElementById('swap-to-amount').value = toAmount.toFixed(8);
}

function setSwapMaxAmount() {
    const usdtBalance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
    let maxBalance = 0;
    if (swapFromCoin === 'USDT') {
        maxBalance = usdtBalance;
    } else {
        maxBalance = parseFloat(localStorage.getItem(`bitnex_spot_${swapFromCoin}`)) || 0;
    }
    document.getElementById('swap-from-amount').value = maxBalance > 0 ? maxBalance.toFixed(8) : '';
    calculateSwapOutput();
}

function swapCoinDirections() {
    const temp = swapFromCoin;
    swapFromCoin = swapToCoin;
    swapToCoin = temp;
    
    document.getElementById('swap-from-coin-text').textContent = swapFromCoin;
    document.getElementById('swap-to-coin-text').textContent = swapToCoin;
    
    updateSwapBalances();
}

function executeSwap() {
    const fromAmount = parseFloat(document.getElementById('swap-from-amount').value);
    const toAmount = parseFloat(document.getElementById('swap-to-amount').value);
    
    if (!fromAmount || fromAmount <= 0) {
        showAlert('Error', 'Enter amount to swap', 'fa-circle-xmark');
        return;
    }
    
    const usdtBalance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
    
    // Перевірка балансу FROM
    let fromBalance = 0;
    if (swapFromCoin === 'USDT') {
        fromBalance = usdtBalance;
    } else {
        fromBalance = parseFloat(localStorage.getItem(`bitnex_spot_${swapFromCoin}`)) || 0;
    }
    
    if (fromAmount > fromBalance) {
        showAlert('Error', `Insufficient ${swapFromCoin} balance`, 'fa-circle-xmark');
        return;
    }
    
    // Віднімаємо FROM
    if (swapFromCoin === 'USDT') {
        localStorage.setItem('bitnex_balance', usdtBalance - fromAmount);
    } else {
        const newFromBalance = fromBalance - fromAmount;
        localStorage.setItem(`bitnex_spot_${swapFromCoin}`, newFromBalance);
    }
    
    // Додаємо TO
    if (swapToCoin === 'USDT') {
        const newBalance = (parseFloat(localStorage.getItem('bitnex_balance')) || 0) + toAmount;
        localStorage.setItem('bitnex_balance', newBalance);
    } else {
        const currentToBalance = parseFloat(localStorage.getItem(`bitnex_spot_${swapToCoin}`)) || 0;
        localStorage.setItem(`bitnex_spot_${swapToCoin}`, currentToBalance + toAmount);
    }
    
    // Оновлюємо баланс на екрані
    const balanceEl = document.getElementById('main-balance');
    if (balanceEl) {
        const newBalance = parseFloat(localStorage.getItem('bitnex_balance')) || 0;
        balanceEl.textContent = newBalance.toFixed(2);
    }
    
    // Додаємо сповіщення
    addNotification('success', `Swapped ${fromAmount.toFixed(6)} ${swapFromCoin} to ${toAmount.toFixed(6)} ${swapToCoin}`);
    
    // Зберігаємо дані ДО закриття модалки
    const savedFromAmt = fromAmount;
    const savedFromSym = swapFromCoin;
    const savedToAmt = toAmount;
    const savedToSym = swapToCoin;
    
    closeSwapModal();
    loadUserData();
    try { loadSpotHoldings(); } catch(e) {}
    
    // Показуємо success modal з затримкою
    setTimeout(() => {
        showSwapSuccessModal(savedFromAmt, savedFromSym, savedToAmt, savedToSym);
    }, 200);
}

// ===== SWAP SUCCESS MODAL =====
function showSwapSuccessModal(fromAmt, fromSym, toAmt, toSym) {
    document.getElementById('ss-from-logo').src = getCryptoLogoUrl(fromSym);
    document.getElementById('ss-to-logo').src = getCryptoLogoUrl(toSym);
    document.getElementById('ss-from-label').textContent = `${fromAmt.toFixed(6)} ${fromSym}`;
    document.getElementById('ss-to-label').textContent = `${toAmt.toFixed(6)} ${toSym}`;

    // Rate
    let fromPrice = 1.0, toPrice = 1.0;
    if (fromSym !== 'USDT') { const c = allAssets.find(a => a.symbol === fromSym); if (c) fromPrice = parseFloat(c.price); }
    if (toSym !== 'USDT') { const c = allAssets.find(a => a.symbol === toSym); if (c) toPrice = parseFloat(c.price); }
    const rate = fromPrice / toPrice;
    document.getElementById('ss-rate').textContent = `1 ${fromSym} = ${rate >= 1 ? rate.toFixed(6) : rate.toFixed(8)} ${toSym}`;

    document.getElementById('swap-success-modal').style.display = 'flex';
}

function closeSwapSuccessModal() {
    document.getElementById('swap-success-modal').style.display = 'none';
}

// ===== NOTIFICATIONS SYSTEM =====
function initNotifications() {
    if (!localStorage.getItem('bitnex_notifications')) {
        const defaultNotifications = [
            {
                id: Date.now() + 1,
                type: 'info',
                title: 'Welcome to BitNex!',
                message: 'Start trading with 10,000 USDT demo balance',
                time: new Date().toISOString(),
                read: false
            },
            {
                id: Date.now() + 2,
                type: 'info',
                title: 'New Features Available',
                message: 'Spot trading and Futures trading now live!',
                time: new Date().toISOString(),
                read: false
            }
        ];
        localStorage.setItem('bitnex_notifications', JSON.stringify(defaultNotifications));
    }
    updateNotificationBadge();
}

function addNotification(type, message, title = null) {
    const notifications = JSON.parse(localStorage.getItem('bitnex_notifications')) || [];
    
    const notification = {
        id: Date.now(),
        type: type, // success, error, info, warning
        title: title || (type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info'),
        message: message,
        time: new Date().toISOString(),
        read: false
    };
    
    notifications.unshift(notification);
    
    // Тримаємо тільки останні 50
    if (notifications.length > 50) {
        notifications.splice(50);
    }
    
    localStorage.setItem('bitnex_notifications', JSON.stringify(notifications));
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const notifications = JSON.parse(localStorage.getItem('bitnex_notifications')) || [];
    const unreadCount = notifications.filter(n => !n.read).length;
    
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
    }
}

function openNotificationsModal() {
    document.getElementById('notifications-modal').style.display = 'flex';
    loadNotifications();
}

function closeNotificationsModal() {
    document.getElementById('notifications-modal').style.display = 'none';
}

function loadNotifications() {
    const notifications = JSON.parse(localStorage.getItem('bitnex_notifications')) || [];
    const list = document.getElementById('notifications-list');
    
    if (notifications.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #888; padding: 40px 20px;">No notifications</p>';
        return;
    }
    
    let html = '';
    notifications.forEach(notif => {
        const date = new Date(notif.time);
        const timeStr = formatNotificationTime(date);
        
        const iconClass = notif.type === 'success' ? 'fa-circle-check' : 
                         notif.type === 'error' ? 'fa-circle-xmark' :
                         notif.type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-info';
        const iconColor = notif.type === 'success' ? '#2EBD85' :
                         notif.type === 'error' ? '#F6465D' :
                         notif.type === 'warning' ? '#F0B90B' : '#4A9EFF';
        
        html += `
        <div style="background: ${notif.read ? '#1a1a1a' : '#1E2026'}; border-radius: 12px; padding: 16px; margin-bottom: 12px; cursor: pointer; border-left: 3px solid ${notif.read ? 'transparent' : 'var(--accent)'};" onclick="markAsRead(${notif.id})">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <div style="flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; background: ${iconColor}20; display: flex; align-items: center; justify-content: center;">
                    <i class="fa-solid ${iconClass}" style="color: ${iconColor}; font-size: 16px;"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 4px;">${notif.title}</div>
                    <div style="font-size: 14px; color: #aaa; margin-bottom: 8px; line-height: 1.4;">${notif.message}</div>
                    <div style="font-size: 12px; color: #666;">${timeStr}</div>
                </div>
            </div>
        </div>
        `;
    });
    
    list.innerHTML = html;
    
    // Позначаємо всі як прочитані через 1 сек
    setTimeout(() => {
        notifications.forEach(n => n.read = true);
        localStorage.setItem('bitnex_notifications', JSON.stringify(notifications));
        updateNotificationBadge();
    }, 1000);
}

function markAsRead(notifId) {
    const notifications = JSON.parse(localStorage.getItem('bitnex_notifications')) || [];
    const notif = notifications.find(n => n.id === notifId);
    if (notif) {
        notif.read = true;
        localStorage.setItem('bitnex_notifications', JSON.stringify(notifications));
        updateNotificationBadge();
        loadNotifications();
    }
}

function formatNotificationTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) + ' ' + 
           date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Ініціалізація при завантаженні
document.addEventListener('DOMContentLoaded', () => {
    initNotifications();
});


init();