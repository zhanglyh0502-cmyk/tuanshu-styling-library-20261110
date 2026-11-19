(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const colorValues = { '红':'#c74b58','粉':'#e8a6be','橘':'#db8a54','黄':'#e3c861','绿':'#70a98d','蓝':'#729cc7','紫':'#a28abb','棕咖':'#94735d','黑':'#353944','白':'#e9edf1','金':'#c8af62','银':'#adb6c5','多色撞色':'conic-gradient(#c74b58,#e3c861,#70a98d,#729cc7,#a28abb,#c74b58)' };
  const categoryOrder = ['妆面', '发型', '服装'];
  const styleOrder = ['甜妹','御姐','国风','二次元','欧美','韩系','港风复古','辣妹Y2K','清冷高级','运动活力','中性酷飒'];
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Private browsing may disable preferences. */ } }
  };
  const state = {
    library: null, entries: [], matches: [], items: [], rendered: 0, query: '', sort: 'newest',
    view: storage.get('styling-share-view') === 'cards' ? 'cards' : 'wall',
    theme: ['light','dark'].includes(storage.get('styling-share-theme')) ? storage.get('styling-share-theme') : 'auto',
    filters: { years: new Set(), categories: new Set(), colors: new Set(), styles: new Set() },
    detail: { entryId: null, index: 0, mode: 'image', zoomed: false },
    lastFocus: null, loading: false
  };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const isPending = image => image.sourceStatus === 'unverified-legacy-origin';
  const shortDate = date => date ? date.slice(5).replace('-', '.') : '';
  const fullDate = date => date ? date.replaceAll('-', '.') : '日期未核实';
  const fileName = (entry, image) => `${entry.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 48) || '妆造参考'}_${image.id.slice(-2)}${isPending(image) ? '_来源待核' : ''}.${image.original.split('.').pop()}`;

  const verifiedSearches = new Map([
    ["6afe202f0000000025011bb7", "带着笼子到处飞的鸟"],
    ["6afe54f1000000002a01abce", "成都礼服租赁｜成都团播造型来啦"],
    ["6afe6fed000000002a028a54", "羽绒服卡卡"],
    ["6afd1100000000002a012f2c", "今儿个这个妆造可以吗"],
    ["6afc3a0e000000002303f6d5", "团播造型极限五选一、团播造型极限五选一"],
    ["6afc5b730000000018029031", "小天才道枝骏佑妆图"],
    ["6afc54fc00000000160321e2", "互勉团播妆造"],
    ["6af84c44000000002602775d", "给skNoNo做的妆造"],
    ["6af6c15f000000002501f0a5", "改妆前后，你更喜欢哪一个？"],
    ["6af46dae000000002b036300", "团播妆造|这个妆造真的好绝！"],
    ["6afd6a120000000018039258", "卧槽卧槽 这是小天才 有病娇那味了"],
    ["6af8335b0000000023012e0f", "团播到底什么长相才吃香？"],
    ["6af57d5d000000002a02ff6d", "中华娘小师妹糕"],
    ["6afbea16000000002b00492d", "女团｜苗疆蛊女穿搭分享👗"],
    ["6afc2842000000001b01d116", "CHELA-绯夜暗"],
    ["6af724ab000000002203badd", "好适配的一套妆造！"],
    ["6af701ac000000002501ec85", "重工黑金西装｜舞台贵族感拉满✨"],
    ["6af2f7c8000000002500ae17", "里里啦｜小猫毛绒绒的造型太可爱啦！"],
    ["6afc5d77000000002a01af1e", "谁懂啊这心动感直接戳中我"],
    ["6afc5dd7000000000902309b", "这期fox是妈妈来的"],
    ["6af45f1d0000000023011c03", "GF女团 白雪公主 妆容改造"],
    ["6af301670000000025009217", "好特别的小刘海 sk卡莎"],
    ["6af53304000000001603d37c", "团播半扎发型上镜妆 甜美妆容 韩系女团风"],
    ["6af53359000000002a00c4d2", "哪个服装更好看呢团播主播 ws女团"]
  ]);
  function originalSearchUrl(entry) {
    const query = verifiedSearches.get(entry.id);
    if (!query) return '';
    const url = new URL("https://www.xiaohongshu.com/search_result");
    // 保留小红书网页搜索使用的两层关键词编码。
    url.searchParams.set("keyword", encodeURIComponent(query));
    url.searchParams.set("source", "web_search_result_notes");
    return url.href;
  }

  function safeNoteUrl(value, author = false) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value);
      const path = author ? /^\/user\/profile\/[a-f\d]{24}$/ : /^\/explore\/[a-f\d]{24}$/;
      return url.protocol === 'https:' && url.hostname === 'www.xiaohongshu.com' && !url.port && !url.username && !url.password && !url.search && !url.hash && path.test(url.pathname) ? url.href : '';
    } catch { return ''; }
  }

  function validateLibrary(data) {
    if (data?.schemaVersion !== 1 || !Array.isArray(data.entries) || !data.summary || data.summary.notes !== data.entries.length) throw new Error('素材目录格式暂时不可用。');
    const ids = new Set();
    let totalImages = 0;
    for (const entry of data.entries) {
      if (!/^[a-f\d]{24}$/.test(entry.id) || ids.has(entry.id) || !Array.isArray(entry.images) || !entry.images.length || !Array.isArray(entry.colors) || !Array.isArray(entry.styles) || typeof entry.title !== 'string' || !categoryOrder.includes(entry.category) || !/^202[456]-\d{2}-\d{2}$/.test(entry.publishedAt) || !safeNoteUrl(entry.link)) throw new Error('部分素材信息暂时不可用。');
      ids.add(entry.id);
      for (const key of ['sourceAccount', 'scene', 'fullText', 'note']) if (typeof entry[key] !== 'string') throw new Error('部分素材信息暂时不可用。');
      if (!entry.colors.every(value => typeof value === 'string') || !entry.styles.every(value => typeof value === 'string') || entry.authorLink && !safeNoteUrl(entry.authorLink, true)) throw new Error('部分素材信息暂时不可用。');
      const imageIds = new Set();
      for (const image of entry.images) {
        if (typeof image.id !== 'string' || !image.id.startsWith(entry.id + '-') || imageIds.has(image.id) || !/^media\/[a-f\d]{24}-\d{2,3}\.(webp|png|jpg)$/.test(image.original) || !/^thumbs\/[a-f\d]{24}-\d{2,3}\.webp$/.test(image.thumbnail) || ![image.width,image.height].every(value => Number.isFinite(value) && value > 0 && value <= 50000) || !['verified-collection','verified-exact-sha256','unverified-legacy-origin'].includes(image.sourceStatus)) throw new Error('部分图片信息暂时不可用。');
        imageIds.add(image.id);
        totalImages++;
      }
      entry.searchText = [entry.title,entry.sourceAccount,entry.scene,entry.note,entry.fullText,...entry.colors,...entry.styles].join('\n').toLocaleLowerCase('zh-CN');
    }
    if (data.summary.images !== totalImages) throw new Error('素材目录信息不完整，请稍后重试。');
    return data;
  }

  function applyTheme() {
    if (state.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = state.theme;
    const label = {auto:'跟随系统',light:'浅色',dark:'深色'}[state.theme];
    $('themeButton').textContent = `外观：${label}`;
    $('themeButton').title = `当前外观${label}，点击切换`;
    storage.set('styling-share-theme', state.theme);
  }

  function makeChip(label, group, value, extraClass = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter-chip ${extraClass}`.trim();
    button.dataset.filter = group;
    button.dataset.value = value;
    button.setAttribute('aria-pressed', value ? state.filters[group].has(value) : state.filters[group].size === 0);
    if (group === 'colors' && value) {
      const swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.background = colorValues[value] || 'var(--surface-alt)';
      button.append(swatch);
    }
    button.append(document.createTextNode(label));
    return button;
  }

  function renderFilters() {
    const years = [...new Set(state.entries.map(entry => entry.publishedAt.slice(0,4)))].sort();
    const colors = [...new Set(state.entries.flatMap(entry => entry.colors))].sort((a,b) => Object.keys(colorValues).indexOf(a) - Object.keys(colorValues).indexOf(b));
    const styles = [...new Set(state.entries.flatMap(entry => entry.styles))].sort((a,b) => styleOrder.indexOf(a) - styleOrder.indexOf(b));
    for (const [id, group, values] of [['yearFilters','years',years],['categoryFilters','categories',categoryOrder],['colorFilters','colors',colors],['styleFilters','styles',styles]]) {
      const fragment = document.createDocumentFragment();
      fragment.append(makeChip('全部', group, ''));
      for (const value of values) fragment.append(makeChip(value, group, value, group === 'colors' ? 'color-chip' : ''));
      $(id).replaceChildren(fragment);
    }
  }

  function renderActiveFilters() {
    const active = $('activeFilters');
    const fragment = document.createDocumentFragment();
    for (const [group, values] of Object.entries(state.filters)) for (const value of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'active-filter';
      button.dataset.filter = group;
      button.dataset.value = value;
      button.setAttribute('aria-label', `移除筛选：${value}`);
      button.textContent = value;
      const cross = document.createElement('span');
      cross.textContent = '×';
      cross.setAttribute('aria-hidden', 'true');
      button.append(cross);
      fragment.append(button);
    }
    active.replaceChildren(fragment);
    active.hidden = !active.children.length;
  }

  function filterEntries() {
    const f = state.filters;
    const q = state.query.trim().toLocaleLowerCase('zh-CN');
    return state.entries.filter(entry =>
      (!f.years.size || f.years.has(entry.publishedAt.slice(0,4))) &&
      (!f.categories.size || f.categories.has(entry.category)) &&
      (!f.colors.size || entry.colors.some(color => f.colors.has(color))) &&
      (!f.styles.size || entry.styles.some(style => f.styles.has(style))) &&
      (!q || entry.searchText.includes(q))
    ).sort((a,b) => (state.sort === 'oldest' ? a.publishedAt.localeCompare(b.publishedAt) : b.publishedAt.localeCompare(a.publishedAt)) || a.id.localeCompare(b.id));
  }

  function imageMarkup(entry, image, index, first) {
    return `<button type="button" class="image-button" data-action="image" data-entry="${entry.id}" data-index="${index}" aria-label="放大查看：${esc(entry.title)}，第${index + 1}张"><img src="${image.thumbnail}" width="${image.width}" height="${image.height}" alt="${esc(entry.title)}，第${index + 1}张" ${first ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></button>`;
  }

  function wallMarkup({entry, image, index}, position) {
    return `<figure class="material">${imageMarkup(entry,image,index,position === 0)}<figcaption><div class="image-meta"><span>${esc(entry.category)} / ${entry.publishedAt.slice(0,4)}</span><time datetime="${entry.publishedAt}">${shortDate(entry.publishedAt)}</time></div><button class="image-title" type="button" data-action="note" data-entry="${entry.id}" title="${esc(entry.title)}">${esc(entry.title)}</button><div class="image-subline"><span class="image-account">${esc(entry.sourceAccount || '来源账号未记录')}</span>${isPending(image) ? '<span class="source-pending">来源待核</span>' : ''}</div></figcaption></figure>`;
  }

  function cardMarkup(entry, position) {
    const searchUrl = originalSearchUrl(entry);
    const searchLink = searchUrl ? `<a class="card-original" href="${esc(searchUrl)}" target="_blank" rel="noopener noreferrer">站内找原帖 ↗</a>` : '';
    const pendingCount = entry.images.filter(isPending).length;
    const tags = [...entry.styles.slice(0,3),...entry.colors.slice(0,2)].map(tag => `<span class="text-tag">${esc(tag)}</span>`).join('');
    return `<article class="note-card">${imageMarkup(entry,entry.images[0],0,position === 0)}<div class="note-card-body"><div class="card-meta"><span>${esc(entry.category)} / ${fullDate(entry.publishedAt)}</span><span>${entry.images.length} 张图</span></div><button class="image-title card-title" type="button" data-action="note" data-entry="${entry.id}">${esc(entry.title)}</button>${entry.scene ? `<p class="card-description">${esc(entry.scene)}</p>` : ''}<div class="card-tag-row">${tags}</div>${pendingCount ? `<p class="source-pending">${pendingCount} 张图片来源待核</p>` : ''}<div class="card-bottom"><span class="card-account">${esc(entry.sourceAccount || '来源账号未记录')}</span><a class="card-original" href="${esc(safeNoteUrl(entry.link))}" target="_blank" rel="noopener noreferrer" aria-label="打开原文：${esc(entry.title)}" aria-describedby="card-original-hint-${entry.id}">打开原文 ↗</a>${searchLink}</div><p id="card-original-hint-${entry.id}" class="original-link-hint card-original-hint">如果小红书原帖打不开，可以在「<button class="card-note-link" type="button" data-action="note" data-entry="${entry.id}">笔记详情</button>」里看原文存档。</p></div></article>`;
  }

  function appendBatch() {
    if (state.rendered >= state.items.length) return;
    const batch = state.view === 'wall' ? 64 : 36;
    const start = state.rendered;
    const items = state.items.slice(start, start + batch);
    const html = items.map((item,index) => state.view === 'wall' ? wallMarkup(item,start + index) : cardMarkup(item,start + index)).join('');
    $('gallery').insertAdjacentHTML('beforeend', html);
    state.rendered += items.length;
    $('moreRow').hidden = state.rendered >= state.items.length;
    $('loadStatus').textContent = `已显示 ${state.rendered} / ${state.items.length} ${state.view === 'wall' ? '张图片' : '篇笔记'}`;
  }

  function refresh() {
    if (!state.library) return;
    state.matches = filterEntries();
    const count = state.matches.reduce((sum, entry) => sum + entry.images.length, 0);
    const total = state.library.summary;
    const active = Object.values(state.filters).some(set => set.size) || state.query.trim();
    $('resultsHeading').textContent = active ? '筛选结果' : '全部素材';
    $('resultCount').textContent = `${state.matches.length} 篇笔记，${count} 张图片${active ? ` / 全库 ${total.notes} 篇` : ''}`;
    $('gallery').className = `gallery ${state.view}`;
    $('gallery').replaceChildren();
    $('gallery').setAttribute('aria-label', state.view === 'wall' ? '素材图片墙' : '素材笔记卡片');
    $('emptyState').hidden = state.matches.length > 0;
    $('errorState').hidden = true;
    $('wallView').setAttribute('aria-pressed', state.view === 'wall');
    $('cardView').setAttribute('aria-pressed', state.view === 'cards');
    state.items = state.view === 'wall' ? state.matches.flatMap(entry => entry.images.map((image,index) => ({entry,image,index}))) : state.matches;
    state.rendered = 0;
    $('moreRow').hidden = true;
    appendBatch();
    renderActiveFilters();
  }

  function clearFilters() {
    const restoreSearchFocus = document.activeElement === $('emptyReset');
    for (const values of Object.values(state.filters)) values.clear();
    state.query = '';
    $('searchInput').value = '';
    renderFilters();
    refresh();
    if (restoreSearchFocus) $('searchInput').focus({preventScroll:true});
  }

  function toggleFilter(group, value) {
    const set = state.filters[group];
    if (!set) return;
    const restoreFilterFocus = document.activeElement?.hasAttribute('data-filter');
    if (!value) set.clear();
    else if (set.has(value)) set.delete(value);
    else set.add(value);
    renderFilters();
    refresh();
    if (restoreFilterFocus) {
      const replacement = [...$('filterContent').querySelectorAll('[data-filter]')].find(button => button.dataset.filter === group && button.dataset.value === value);
      if (replacement?.getClientRects().length) replacement.focus({preventScroll:true});
      else $('mobileFilters').focus({preventScroll:true});
    }
  }

  function getDetailEntry() { return state.entries.find(entry => entry.id === state.detail.entryId); }

  function showDetail(entryId, index = 0, mode = 'image') {
    const entry = state.entries.find(item => item.id === entryId);
    if (!entry) return;
    state.detail = {entryId, index:Math.max(0,Math.min(index,entry.images.length - 1)), mode, zoomed:false};
    const wasOpen = $('detailDialog').open;
    if (!wasOpen) {
      state.lastFocus = document.activeElement;
      document.body.style.overflow = 'hidden';
      $('detailDialog').showModal();
    }
    renderDetail();
    $('detailDialog').scrollTop = 0;
    if (wasOpen) $('closeDialog').focus({preventScroll:true});
  }

  function setLink(id, value) {
    const link = $(id);
    if (!link) return;
    link.hidden = !value;
    if (value) link.href = value;
    else link.removeAttribute('href');
  }

  function renderDetail() {
    const entry = getDetailEntry();
    if (!entry) return;
    const image = entry.images[state.detail.index];
    $('dialogTitle').textContent = entry.title;
    $('dialogEyebrow').textContent = `${entry.category} / ${fullDate(entry.publishedAt)}${entry.sourceAccount ? ` / ${entry.sourceAccount}` : ''}`;
    $('imagePanel').hidden = state.detail.mode !== 'image';
    $('notePanel').hidden = state.detail.mode !== 'note';
    setLink('directNoteLink', safeNoteUrl(entry.link));
    setLink('noteLink', safeNoteUrl(entry.link));
    const searchUrl = originalSearchUrl(entry);
    setLink('imageSearchLink', searchUrl);
    setLink('noteSearchLink', searchUrl);
    setLink('authorLink', safeNoteUrl(entry.authorLink, true));
    if (state.detail.mode === 'note') {
      renderNote(entry);
      return;
    }
    $('imageLoadError').hidden = true;
    $('fullImage').src = image.original;
    $('fullImage').alt = `${entry.title}，第${state.detail.index + 1}张${isPending(image) ? '，来源待核' : ''}`;
    $('fullImage').width = image.width;
    $('fullImage').height = image.height;
    $('imageCounter').textContent = `${state.detail.index + 1} / ${entry.images.length} 张`;
    $('imageSourceStatus').textContent = isPending(image) ? '来源待核，笔记日期仅作归档参考' : '图片来源已核实';
    $('imageSourceStatus').className = isPending(image) ? 'source-pending' : '';
    $('previousImage').disabled = entry.images.length < 2;
    $('nextImage').disabled = entry.images.length < 2;
    $('downloadImage').href = image.original;
    $('downloadImage').download = fileName(entry,image);
    state.detail.zoomed = false;
    $('imageViewport').classList.remove('zoomed');
    $('imageViewport').scrollTo(0,0);
    $('zoomButton').textContent = '原尺寸';
    $('zoomButton').setAttribute('aria-pressed','false');
  }

  function renderNote(entry) {
    const pendingCount = entry.images.filter(isPending).length;
    const metadata = [['类别',entry.category],['笔记发布日期',fullDate(entry.publishedAt)],['来源账号',entry.sourceAccount || '未记录'],['场景 / 用途',entry.scene || '未标注'],['图片数量',`${entry.images.length} 张`],['图片来源',pendingCount ? `${pendingCount} 张来源待核，其余已核实` : '全部已核实']];
    const fragment = document.createDocumentFragment();
    for (const [label,value] of metadata) {
      const group = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      group.append(dt,dd);
      fragment.append(group);
    }
    $('noteMeta').replaceChildren(fragment);
    $('noteTags').innerHTML = [...entry.styles,...entry.colors].map(tag => `<span class="text-tag">${esc(tag)}</span>`).join('');
    $('noteSummarySection').hidden = !entry.note;
    $('noteSummary').textContent = entry.note;
    $('noteFullText').textContent = entry.fullText || '这篇笔记未保存正文，可以打开原笔记查看。';
    $('noteThumbnails').innerHTML = entry.images.map((image,index) => `<figure>${imageMarkup(entry,image,index,false)}<figcaption>第 ${index + 1} 张${isPending(image) ? ' / 来源待核' : ''}</figcaption></figure>`).join('');
  }

  function stepImage(direction) {
    const entry = getDetailEntry();
    if (!entry || entry.images.length < 2) return;
    state.detail.index = (state.detail.index + direction + entry.images.length) % entry.images.length;
    renderDetail();
  }

  function changeDetailMode(mode) {
    state.detail.mode = mode;
    renderDetail();
    $('detailDialog').scrollTop = 0;
    (mode === 'note' ? $('backToImages') : $('showNote')).focus();
  }

  function setView(view) {
    state.view = view;
    storage.set('styling-share-view',view);
    refresh();
  }

  function onMaterialClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    showDetail(button.dataset.entry,Number(button.dataset.index || 0),button.dataset.action === 'note' ? 'note' : 'image');
  }

  async function loadLibrary() {
    if (state.loading) return;
    state.loading = true;
    $('errorState').hidden = true;
    $('emptyState').hidden = true;
    $('gallery').setAttribute('aria-busy','true');
    $('resultCount').textContent = '正在读取素材目录';
    try {
      const response = await fetch('./library.json',{method:'GET'});
      if (!response.ok) throw new Error('暂时无法读取素材目录，请稍后重试。');
      const library = validateLibrary(await response.json());
      state.library = library;
      state.entries = library.entries;
      renderFilters();
      const summary = library.summary;
      $('librarySummary').textContent = `素材来源：小红书 / ${summary.notes} 篇笔记 / ${summary.images} 张图片 / ${summary.unverifiedSourceImages} 张来源待核`;
      refresh();
    } catch (error) {
      $('gallery').replaceChildren();
      $('moreRow').hidden = true;
      $('resultCount').textContent = '目录暂未加载';
      $('errorState').hidden = false;
      $('errorMessage').textContent = error instanceof TypeError ? '网络可能暂时不可用，请检查连接后重试。' : error.message;
    } finally {
      state.loading = false;
      $('gallery').setAttribute('aria-busy','false');
    }
  }

  $('filterContent').addEventListener('click',event => { const button = event.target.closest('[data-filter]'); if (button) toggleFilter(button.dataset.filter,button.dataset.value); });
  $('activeFilters').addEventListener('click',event => { const button = event.target.closest('[data-filter]'); if (button) toggleFilter(button.dataset.filter,button.dataset.value); });
  $('clearFilters').addEventListener('click',clearFilters);
  $('emptyReset').addEventListener('click',clearFilters);
  $('retryButton').addEventListener('click',loadLibrary);
  $('wallView').addEventListener('click',() => setView('wall'));
  $('cardView').addEventListener('click',() => setView('cards'));
  $('sortInput').addEventListener('change',event => { state.sort = event.target.value; refresh(); });
  let searchTimer;
  $('searchInput').addEventListener('input',event => { state.query = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(refresh,120); });
  $('mobileFilters').addEventListener('click',() => { const open = $('mobileFilters').getAttribute('aria-expanded') !== 'true'; $('mobileFilters').setAttribute('aria-expanded',open); $('mobileFilters').textContent = open ? '收起筛选' : '展开筛选'; document.querySelector('.filter-sidebar').classList.toggle('expanded',open); });
  $('themeButton').addEventListener('click',() => { state.theme = {auto:'light',light:'dark',dark:'auto'}[state.theme]; applyTheme(); });
  $('gallery').addEventListener('click',onMaterialClick);
  $('noteThumbnails').addEventListener('click',onMaterialClick);
  $('gallery').addEventListener('error',event => { if (event.target.tagName === 'IMG') { event.target.classList.add('image-unavailable'); event.target.alt = '缩略图暂不可用，点击查看原图'; } },true);
  $('fullImage').addEventListener('error',() => { $('imageLoadError').hidden = false; });
  $('fullImage').addEventListener('load',() => { $('imageLoadError').hidden = true; });
  $('closeDialog').addEventListener('click',() => $('detailDialog').close());
  $('detailDialog').addEventListener('close',() => { document.body.style.overflow = ''; if (state.lastFocus?.isConnected) state.lastFocus.focus({preventScroll:true}); });
  $('detailDialog').addEventListener('click',event => { const rect = $('detailDialog').getBoundingClientRect(); if (event.target === $('detailDialog') && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) $('detailDialog').close(); });
  $('detailDialog').addEventListener('keydown',event => { if (state.detail.mode === 'image' && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); stepImage(event.key === 'ArrowLeft' ? -1 : 1); } });
  $('previousImage').addEventListener('click',() => stepImage(-1));
  $('nextImage').addEventListener('click',() => stepImage(1));
  $('showNote').addEventListener('click',() => changeDetailMode('note'));
  $('backToImages').addEventListener('click',() => changeDetailMode('image'));
  $('zoomButton').addEventListener('click',() => { state.detail.zoomed = !state.detail.zoomed; $('imageViewport').classList.toggle('zoomed',state.detail.zoomed); $('zoomButton').textContent = state.detail.zoomed ? '适应窗口' : '原尺寸'; $('zoomButton').setAttribute('aria-pressed',state.detail.zoomed); });
  $('loadMore').addEventListener('click',appendBatch);
  if ('IntersectionObserver' in window) {
    const moreObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) appendBatch(); },{rootMargin:'700px'});
    moreObserver.observe($('moreRow'));
  }
  applyTheme();
  loadLibrary();
})();
