/* القائمة الجانبية المشتركة - منصة أرض الأحياء
   ضع هذا الملف بجانب index.html الرئيسي، ثم استدعه من كل صفحة. */
(() => {
  'use strict';

  const currentScript = document.currentScript;
  const scriptURL = currentScript ? currentScript.src : new URL('sidebar.js', location.href).href;
  const rootURL = new URL('.', scriptURL);
  const pageURL = location.pathname.replace(/\\/g, '/');
  const links = [
    { id: 'home', label: 'الرئيسية', icon: 'fa-solid fa-house', path: 'index.html' },
    { id: 'videos', label: 'المحاضرات', icon: 'fa-regular fa-circle-play', path: 'videos/index.html' },
    { id: 'notes', label: 'المذكرات', icon: 'fa-solid fa-book-open', path: 'notes/index.html' },
    { id: 'champion', label: 'بطل الفصل', icon: 'fa-solid fa-trophy', path: 'champion/index.html' },
    { id: 'forum', label: 'المنتدى', icon: 'fa-regular fa-comments', path: 'forum/index.html' },
    { id: 'account', label: 'حساب الطالب', icon: 'fa-regular fa-user', path: 'account/index.html' }
  ];

  // تحميل Font Awesome تلقائيًا إذا لم يكن موجودًا في الصفحة.
  if (!document.querySelector('link[href*="font-awesome"],link[href*="fontawesome"]')) {
    const icons = document.createElement('link');
    icons.rel = 'stylesheet';
    icons.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css';
    document.head.appendChild(icons);
  }

  const style = document.createElement('style');
  style.id = 'ard-shared-sidebar-style';
  style.textContent = `
    :root { --ard-sidebar-width: 272px; --ard-sidebar-collapsed: 82px; }
    #ard-shared-sidebar {
      position: fixed; top: 0; right: 0; bottom: 0; width: var(--ard-sidebar-width);
      padding: 16px 15px 22px; background: linear-gradient(180deg,#004e4d,#003d50 62%,#07375b);
      color: #fff; z-index: 99999; overflow-y: auto; overflow-x: hidden;
      transition: width .25s ease; direction: rtl; font-family: Cairo, sans-serif;
      box-sizing: border-box; scrollbar-width: thin;
    }
    #ard-shared-sidebar * { box-sizing: border-box; }
    #ard-shared-sidebar.is-collapsed { width: var(--ard-sidebar-collapsed); }
    #ard-shared-sidebar .ard-toggle {
      display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;
      margin: 0 auto 8px; border: 1px solid #ffffff30; border-radius: 50%;
      background: #ffffff15; color: #fff; font-size: 18px; cursor: pointer;
    }
    #ard-shared-sidebar .ard-brand { text-align: center; padding: 12px 0 22px; border-bottom: 1px solid #ffffff20; margin-bottom: 20px; }
    #ard-shared-sidebar .ard-brand img { width: 75px; height: 75px; object-fit: contain; display: block; margin: 0 auto; }
    #ard-shared-sidebar .ard-brand h2 { font-size: 22px; font-weight: 900; margin: 8px 0 0; color: #fff; }
    #ard-shared-sidebar .ard-brand p { font-size: 12px; opacity: .8; margin: 0; color: #fff; }
    #ard-shared-sidebar nav { display: flex; flex-direction: column; gap: 7px; }
    #ard-shared-sidebar nav a {
      display: flex; align-items: center; gap: 15px; min-height: 48px; padding: 12px 15px;
      border-radius: 12px; color: #fff; font-size: 14px; font-weight: 700; white-space: nowrap;
      text-decoration: none; transition: background .2s; 
    }
    #ard-shared-sidebar nav a:hover { background: #ffffff18; }
    #ard-shared-sidebar nav a.active { background: linear-gradient(110deg,#1da77b,#159b78); }
    #ard-shared-sidebar nav a i { width: 27px; min-width: 27px; text-align: center; font-size: 19px; }
    #ard-shared-sidebar.is-collapsed .ard-brand h2,
    #ard-shared-sidebar.is-collapsed .ard-brand p,
    #ard-shared-sidebar.is-collapsed nav a span { display: none; }
    #ard-shared-sidebar.is-collapsed .ard-brand img { width: 48px; height: 48px; }
    #ard-shared-sidebar.is-collapsed nav a { justify-content: center; padding: 13px 5px; }
    body.ard-has-sidebar .main { margin-right: var(--ard-sidebar-width) !important; transition: margin-right .25s ease; }
    body.ard-has-sidebar .main.ard-sidebar-collapsed { margin-right: var(--ard-sidebar-collapsed) !important; }
    @media (max-width: 850px) {
      #ard-shared-sidebar { width: var(--ard-sidebar-collapsed); padding: 12px 8px; }
      #ard-shared-sidebar .ard-brand h2, #ard-shared-sidebar .ard-brand p,
      #ard-shared-sidebar nav a span { display: none; }
      #ard-shared-sidebar .ard-brand img { width: 48px; height: 48px; }
      #ard-shared-sidebar nav a { justify-content: center; padding: 13px 5px; }
      body.ard-has-sidebar .main { margin-right: var(--ard-sidebar-collapsed) !important; }
    }
  `;
  document.head.appendChild(style);

  const sidebar = document.createElement('aside');
  sidebar.id = 'ard-shared-sidebar';
  sidebar.setAttribute('aria-label', 'القائمة الرئيسية');

  const brandImage = new URL('logo.png', rootURL).href;
  const navHTML = links.map(item => {
    const href = new URL(item.path, rootURL).href;
    const targetPath = new URL(href).pathname.replace(/\/$/, '');
    const active = pageURL.replace(/\/$/, '') === targetPath ||
      (item.id === 'home' && (pageURL.endsWith('/') || pageURL.endsWith('/index.html')));
    return `<a href="${href}" class="${active ? 'active' : ''}" title="${item.label}" ${active ? 'aria-current="page"' : ''}>
      <i class="${item.icon}" aria-hidden="true"></i><span>${item.label}</span>
    </a>`;
  }).join('');

  sidebar.innerHTML = `
    <button class="ard-toggle" type="button" aria-label="تصغير أو تكبير القائمة" title="تصغير أو تكبير القائمة">
      <i class="fa-solid fa-bars" aria-hidden="true"></i>
    </button>
    <div class="ard-brand">
      <img src="${brandImage}" alt="أرض الأحياء">
      <h2>أرض الأحياء</h2><p>الثانوية العامة</p>
    </div>
    <nav>${navHTML}</nav>
  `;

  const mount = () => {
    if (document.getElementById('ard-shared-sidebar')) return;
    document.body.insertBefore(sidebar, document.body.firstChild);
    document.body.classList.add('ard-has-sidebar');

    const main = document.querySelector('.main');
    const toggle = sidebar.querySelector('.ard-toggle');
    const icon = toggle.querySelector('i');

    const applyState = collapsed => {
      sidebar.classList.toggle('is-collapsed', collapsed);
      if (main) main.classList.toggle('ard-sidebar-collapsed', collapsed);
      icon.className = collapsed ? 'fa-solid fa-bars' : 'fa-solid fa-angles-right';
      toggle.setAttribute('aria-label', collapsed ? 'تكبير القائمة' : 'تصغير القائمة');
      try { localStorage.setItem('ardAlahyaaSidebarCollapsed', String(collapsed)); } catch (_) {}
    };

    let saved = false;
    try { saved = localStorage.getItem('ardAlahyaaSidebarCollapsed') === 'true'; } catch (_) {}
    if (window.matchMedia('(max-width: 850px)').matches) saved = true;
    applyState(saved);

    toggle.addEventListener('click', () => {
      applyState(!sidebar.classList.contains('is-collapsed'));
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
