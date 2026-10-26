const views = document.querySelectorAll('.view');
const emergencyButton = document.querySelector('#emergency-button');
const sendButton = document.querySelector('#send-request');
const locationText = document.querySelector('#location-text');
const locationBox = document.querySelector('#location-box');
const toast = document.querySelector('#toast');
const countryInput = document.querySelector('#country-input');
const countryOptions = document.querySelector('#country-options');
const countryHelp = document.querySelector('#country-help');
const menuToggle = document.querySelector('#menu-toggle');
const mainMenu = document.querySelector('#main-menu');
const contactForm = document.querySelector('#contact-form');
const contactList = document.querySelector('#contact-list');
let travelMode = 'walk';
let isCountryMapView = false;
let position = null;
let selectedSituation = '대피가 필요합니다';
let hasMovedToDetail = false;
let map, baseTileLayer, userMarker, shelterMarker, routeLine;
let selectedCountry = null;
let isSatelliteMap = false;
const countries = {
  israel: {
    name: '이스라엘', aliases: ['이스라엘', 'israel'],
    demoLocation: { lat: 31.7683, lng: 35.2137 },
    shelter: { lat: 31.7783, lng: 35.2237, name: '예루살렘 공식 임시 집결지', address: '이스라엘 · 외교부 확인 안내 기준' },
    notice: { title: '현재 위치 적용 대피 공지', body: '지정 대피 장소로 이동 전 현지 공관의 최신 안내를 확인하세요.', placeDetail: '현재 위치에서 가장 가까운 공식 안내 지점' },
    bounds: [[29.4, 34.2], [33.4, 35.9]]
  },
  iran: {
    name: '이란', aliases: ['이란', 'iran'],
    demoLocation: { lat: 35.6892, lng: 51.3890 },
    shelter: { lat: 35.6992, lng: 51.3990, name: '테헤란 공식 임시 집결지', address: '이란 · 외교부 확인 안내 기준' },
    notice: { title: '현재 위치 적용 대피 공지', body: '이동 전 공식 대피 지침과 통행 가능 여부를 다시 확인하세요.', placeDetail: '현재 위치에서 가장 가까운 공식 안내 지점' },
    bounds: [[25.0, 44.0], [40.0, 63.5]]
  }
};

function selectCountry(key) {
  selectedCountry = key;
  const country = countries[key];
  countryInput.value = country.name;
  countryOptions.classList.remove('open');
  countryHelp.textContent = '입력한 국가의 실제 지도와 대피 안내를 준비했습니다.';
  countryHelp.classList.remove('error');
}
function matchingCountry(value) {
  const normalized = value.trim().toLowerCase();
  return Object.keys(countries).find(key => countries[key].aliases.includes(normalized));
}
countryInput.addEventListener('input', () => {
  const key = matchingCountry(countryInput.value);
  if (key) selectCountry(key); else { selectedCountry = null; countryHelp.textContent = '국가명을 정확히 입력해주세요.'; countryHelp.classList.add('error'); }
});
document.querySelector('#clear-country').addEventListener('click', () => { countryInput.value = ''; selectedCountry = null; countryHelp.textContent = '국가를 입력하면 해당 지역의 실제 지도를 불러옵니다.'; countryHelp.classList.remove('error'); countryInput.focus(); });

function showView(name) {
  views.forEach(v => v.classList.toggle('active', v.id === `${name}-view`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'map') setTimeout(initMap, 60);
}
document.querySelectorAll('[data-home]').forEach(el => el.addEventListener('click', () => showView('home')));
document.querySelectorAll('[data-enter-home]').forEach(el => el.addEventListener('click', () => showView('home')));
document.querySelectorAll('[data-show-map]').forEach(el => el.addEventListener('click', () => showView('map')));
document.querySelectorAll('[data-show-alerts]').forEach(el => el.addEventListener('click', () => showView('alerts')));
document.querySelectorAll('[data-show-shelters]').forEach(el => el.addEventListener('click', () => {
  const country = countries[selectedCountry] || countries.israel;
  document.querySelector('#shelter-list-primary').textContent = country.shelter.name;
  document.querySelector('#shelter-list-address').textContent = country.shelter.address;
  showView('shelters');
}));
document.querySelectorAll('[data-show-contacts]').forEach(el => el.addEventListener('click', () => { showView('contacts'); renderContacts(); }));
menuToggle.addEventListener('click', () => {
  const isOpen = mainMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
});
document.querySelectorAll('#main-menu button').forEach(button => button.addEventListener('click', () => {
  mainMenu.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', '메뉴 열기');
}));
document.querySelector('[data-menu-emergency]').addEventListener('click', () => beginEmergencyRequest());
document.addEventListener('click', event => { if (!document.querySelector('.menu-wrap').contains(event.target)) { mainMenu.classList.remove('open'); menuToggle.setAttribute('aria-expanded', 'false'); } });
function beginEmergencyRequest() {
  const inputKey = matchingCountry(countryInput.value);
  if (inputKey) selectCountry(inputKey);
  if (!selectedCountry) {
    showView('home');
    countryHelp.textContent = '긴급 요청을 위해 현재 체류 중인 국가를 먼저 입력해주세요.';
    countryHelp.classList.add('error');
    setTimeout(() => countryInput.focus(), 250);
    return;
  }
  position = null; hasMovedToDetail = false; setProgress(1); showView('request'); requestLocation();
}
emergencyButton.addEventListener('click', beginEmergencyRequest);

document.querySelectorAll('.situation').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.situation').forEach(b => b.classList.remove('selected'));
  button.classList.add('selected'); selectedSituation = button.dataset.situation;
}));
document.querySelector('#detail').addEventListener('focus', () => { hasMovedToDetail = true; updateProgress(); });
document.querySelector('#detail').addEventListener('input', () => { hasMovedToDetail = true; updateProgress(); });

function setProgress(activeStep, completedSteps = []) {
  document.querySelectorAll('[data-step]').forEach(step => {
    const number = Number(step.dataset.step);
    step.classList.toggle('active', number === activeStep);
    step.classList.toggle('complete', completedSteps.includes(number));
  });
}
function updateProgress() {
  if (!position) return setProgress(1);
  if (!hasMovedToDetail) return setProgress(2, [1]);
  setProgress(3, [1, 2]);
}

function setLocation(coords, isDemo = false) {
  const country = countries[selectedCountry];
  const isInCountry = coords.lat >= country.bounds[0][0] && coords.lat <= country.bounds[1][0] && coords.lng >= country.bounds[0][1] && coords.lng <= country.bounds[1][1];
  const useDemo = isDemo || !isInCountry;
  position = { lat: useDemo ? country.demoLocation.lat : coords.lat, lng: useDemo ? country.demoLocation.lng : coords.lng, label: useDemo ? `${country.name} · 선택 국가 기준 안내 위치` : `현재 위치 · ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` };
  locationBox.classList.remove('loading'); locationBox.classList.add('ready');
  locationText.textContent = useDemo ? `선택한 ${country.name} 기준으로 대피 경로를 안내합니다.` : position.label;
  sendButton.disabled = false;
  document.querySelector('#route-origin').textContent = position.label;
  updateProgress();
}
function requestLocation() {
  locationBox.className = 'location-box loading';
  locationText.textContent = '브라우저 위치 권한을 요청하고 있습니다.';
  if (!navigator.geolocation) return setLocation(countries[selectedCountry].demoLocation, true);
  navigator.geolocation.getCurrentPosition(
    p => setLocation({lat:p.coords.latitude, lng:p.coords.longitude}),
    () => setLocation(countries[selectedCountry].demoLocation, true),
    {enableHighAccuracy:true, timeout:8000, maximumAge:60000}
  );
}
sendButton.addEventListener('click', () => {
  setProgress(3, [1, 2, 3]);
  const receipt = `SW-${Date.now().toString().slice(-6)}`;
  localStorage.setItem('safeWayLastRequest', receipt);
  document.querySelector('#receipt-number').textContent = receipt;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); showView('status'); }, 1250);
});
document.querySelector('#refresh-route').addEventListener('click', () => { requestLocation(); setTimeout(initMap, 500); });
document.querySelector('#shelter-detail-button').addEventListener('click', () => document.querySelector('#shelter-detail').classList.toggle('open'));
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  travelMode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach(mode => mode.classList.toggle('selected', mode === button));
  initMap();
}));
document.querySelector('#save-offline').addEventListener('click', () => {
  const country = countries[selectedCountry] || countries.israel;
  localStorage.setItem('safeWayOfflineGuide', JSON.stringify({ country: country.name, savedAt: new Date().toISOString(), shelter: country.shelter.name }));
  const button = document.querySelector('#save-offline');
  button.textContent = '✓  오프라인 안내가 저장되었습니다'; button.classList.add('saved');
  document.querySelector('#offline-status').textContent = '이 기기에서 기본 대피 안내와 지정 장소를 확인할 수 있습니다.';
});
document.querySelector('#country-map-toggle').addEventListener('click', () => {
  isCountryMapView = !isCountryMapView;
  initMap();
});
document.querySelector('#map-style-toggle').addEventListener('click', () => {
  if (!window.L || !map) return;
  isSatelliteMap = !isSatelliteMap;
  if (baseTileLayer) baseTileLayer.remove();
  const tileUrl = isSatelliteMap
    ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = isSatelliteMap ? 'Tiles © Esri' : '© OpenStreetMap';
  baseTileLayer = L.tileLayer(tileUrl, { maxZoom: 19, attribution }).addTo(map);
  document.querySelector('#map-style-toggle').textContent = isSatelliteMap ? '▤ 일반 지도 보기' : '◈ 위성 지도 보기';
});

function renderContacts() {
  const contacts = JSON.parse(localStorage.getItem('safeWayContacts') || '[]');
  contactList.innerHTML = contacts.length ? contacts.map((contact, index) => `<div class="contact-item"><span>☎</span><div><b>${contact.name}</b><small>${contact.phone}${contact.relation ? ` · ${contact.relation}` : ''}</small></div><button type="button" data-remove-contact="${index}">삭제</button></div>`).join('') : '<p style="font-size:11px;color:#8999a8;padding-top:12px">등록된 비상 연락처가 없습니다.</p>';
  document.querySelectorAll('[data-remove-contact]').forEach(button => button.addEventListener('click', () => {
    const updated = JSON.parse(localStorage.getItem('safeWayContacts') || '[]');
    updated.splice(Number(button.dataset.removeContact), 1); localStorage.setItem('safeWayContacts', JSON.stringify(updated)); renderContacts();
  }));
}
contactForm.addEventListener('submit', event => {
  event.preventDefault();
  const contacts = JSON.parse(localStorage.getItem('safeWayContacts') || '[]');
  contacts.push({ name: document.querySelector('#contact-name').value.trim(), phone: document.querySelector('#contact-phone').value.trim(), relation: document.querySelector('#contact-relation').value.trim() });
  localStorage.setItem('safeWayContacts', JSON.stringify(contacts)); contactForm.reset(); renderContacts();
});

function initMap() {
  const country = countries[selectedCountry] || countries.israel;
  const here = position || { ...country.demoLocation, label: `${country.name} · 선택 국가 기준 안내 위치` };
  const shelter = country.shelter;
  document.querySelector('#route-origin').textContent = here.label;
  document.querySelector('#shelter-name').textContent = shelter.name;
  document.querySelector('#shelter-address').textContent = shelter.address;
  document.querySelector('#notice-title').textContent = country.notice.title;
  document.querySelector('#notice-body').textContent = country.notice.body;
  document.querySelector('#designated-place-name').textContent = shelter.name;
  document.querySelector('#designated-place-detail').textContent = country.notice.placeDetail;
  if (!window.L) {
    const query = isCountryMapView ? country.name : `${here.lat},${here.lng}`;
    const zoom = isCountryMapView ? 6 : 12;
    const mapUrl = `https://www.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&hl=ko&output=embed`;
    document.querySelector('#map').innerHTML = `<iframe title="실제 지도" style="border:0;width:100%;height:100%" loading="lazy" src="${mapUrl}"></iframe>`;
    document.querySelector('#map-style-toggle').style.display = 'none';
    document.querySelector('#country-map-toggle').textContent = isCountryMapView ? '⌖ 대피 경로 중심으로 보기' : '▣ 국가 전체 지도 보기';
    return;
  }
  if (!map) {
    map = L.map('map', { zoomControl: false }).setView([here.lat, here.lng], 13);
    L.control.zoom({ position:'bottomright' }).addTo(map);
    baseTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(map);
  }
  if (userMarker) userMarker.remove(); if (shelterMarker) shelterMarker.remove(); if (routeLine) routeLine.remove();
  const userIcon = L.divIcon({className:'', html:'<div style="width:18px;height:18px;border:4px solid white;background:#247be0;border-radius:50%;box-shadow:0 1px 7px #234b72"></div>', iconSize:[18,18], iconAnchor:[9,9]});
  const shelterIcon = L.divIcon({className:'', html:'<div style="width:29px;height:29px;display:grid;place-items:center;background:#159860;color:#fff;border:3px solid white;border-radius:50%;box-shadow:0 2px 7px #234b72;font-size:15px">⌂</div>', iconSize:[29,29], iconAnchor:[14,14]});
  userMarker = L.marker([here.lat, here.lng], {icon:userIcon}).addTo(map).bindPopup('현재 위치');
  shelterMarker = L.marker([shelter.lat, shelter.lng], {icon:shelterIcon}).addTo(map).bindPopup(`<b>${shelter.name}</b><br>${shelter.address}`);
  const mid = [(here.lat+shelter.lat)/2+.002, (here.lng+shelter.lng)/2-.002];
  routeLine = L.polyline([[here.lat,here.lng], mid, [shelter.lat,shelter.lng]], {color:'#247be0', weight:5, opacity:.9, lineJoin:'round'}).addTo(map);
  const mapToggle = document.querySelector('#country-map-toggle');
  if (isCountryMapView) {
    map.fitBounds(country.bounds, { padding: [18, 18] });
    mapToggle.textContent = '⌖ 대피 경로 중심으로 보기';
  } else {
    map.fitBounds(routeLine.getBounds(), {padding:[55,55]});
    mapToggle.textContent = '▣ 국가 전체 지도 보기';
  }
  const km = (Math.sqrt(Math.pow((here.lat-shelter.lat)*111,2)+Math.pow((here.lng-shelter.lng)*88,2))).toFixed(1);
  const minutes = travelMode === 'walk' ? Math.max(8, Math.round(km * 13)) : Math.max(4, Math.round(km * 3));
  document.querySelector('#route-distance').textContent = `약 ${km} km · ${travelMode === 'walk' ? '도보' : '차량'} ${minutes}분`;
  const offlineGuide = localStorage.getItem('safeWayOfflineGuide');
  if (offlineGuide) { document.querySelector('#save-offline').textContent = '✓  오프라인 안내가 저장되었습니다'; document.querySelector('#save-offline').classList.add('saved'); }
  map.invalidateSize();
}
