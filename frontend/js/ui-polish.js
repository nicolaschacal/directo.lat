(() => {
  const style = document.createElement('style');
  style.textContent = `
    /* Persistent location control */
    .location-section.location-persistent {
      position: sticky !important;
      top: 8px !important;
      z-index: 30 !important;
      width: min(620px, calc(100% - 20px)) !important;
      margin: 8px auto !important;
      padding: 0 !important;
      pointer-events: none;
    }
    .location-section.location-persistent > * { pointer-events: auto; }
    .location-section.location-persistent .quick-label {
      display: inline-flex !important;
      align-items: center;
      margin: 0 0 6px 4px !important;
      padding: 5px 9px !important;
      border-radius: 999px !important;
      background: color-mix(in srgb, var(--surface-2,#26343d) 94%, transparent) !important;
      color: var(--text-2,#aebbc4) !important;
      box-shadow: 0 2px 12px rgba(0,0,0,.12);
      font-size: 11px !important;
      font-weight: 700 !important;
    }
    .location-section.location-persistent .location-intro { margin: 0 0 7px 4px !important; }
    .location-section.location-persistent .location-form {
      padding: 10px !important;
      border-radius: 18px !important;
      background: color-mix(in srgb, var(--surface,#202c33) 96%, transparent) !important;
      box-shadow: 0 8px 28px rgba(0,0,0,.18) !important;
      backdrop-filter: blur(14px);
    }
    .location-section.location-persistent .location-field {
      min-height: 56px !important;
      border-radius: 15px !important;
      background: var(--surface-2,#26343d) !important;
      border-color: var(--line,rgba(255,255,255,.08)) !important;
    }
    .location-section.location-persistent .location-save { min-height: 48px !important; border-radius: 15px !important; }
    .location-section.location-persistent .location-chosen {
      display: flex !important;
      align-items: center;
      gap: 9px;
      min-height: 48px !important;
      padding: 7px 9px 7px 12px !important;
      border-radius: 16px !important;
      background: var(--surface-2,#26343d) !important;
      box-shadow: 0 5px 18px rgba(0,0,0,.16) !important;
      font-size: 13px !important;
    }
    .location-section.location-persistent .location-chosen svg { width: 18px; height: 18px; flex: 0 0 auto; color: var(--accent,#6f8cff); }
    .location-section.location-persistent .location-chosen .location-change {
      margin-left: auto !important;
      padding: 6px 10px !important;
      border-radius: 10px !important;
      background: color-mix(in srgb, var(--accent,#6f8cff) 12%, transparent) !important;
    }
    @media (min-width:681px) {
      .location-section.location-persistent .location-form { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
      .location-section.location-persistent .location-field:first-child,
      .location-section.location-persistent .location-save { grid-column: 1/-1; }
    }

    /* Richer WhatsApp-style profile */
    .business-profile .profile-hero {
      flex: 0 0 auto !important;
      padding: 22px 18px 14px !important;
      background: linear-gradient(180deg, var(--surface,#202c33), color-mix(in srgb, var(--surface,#202c33) 92%, var(--accent,#6f8cff) 8%)) !important;
    }
    .business-profile .profile-avatar-large {
      width: clamp(76px, 12dvh, 104px) !important;
      height: clamp(76px, 12dvh, 104px) !important;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent,#6f8cff) 16%, transparent), 0 10px 28px rgba(0,0,0,.18) !important;
    }
    .business-profile .profile-actions { margin-top: 14px !important; }
    .business-profile .profile-info-card { margin: 0 12px !important; width: calc(100% - 24px) !important; border-radius: 16px !important; background: var(--surface-2,#26343d) !important; }
    .business-profile .profile-info-card .profile-info-row,
    .business-profile .profile-info-card .profile-contact-row,
    .business-profile .profile-info-card .profile-social-row { padding-left: 15px !important; padding-right: 15px !important; }
    .business-profile .profile-info-card:has(.profile-hours) { margin-top: 2px !important; }
    .business-profile .profile-contact-card { overflow: hidden !important; }
    .business-profile .profile-disclaimer { display: block !important; margin: 2px 18px 8px !important; text-align: center; color: var(--text-3,#7d8a94) !important; font-size: 11px !important; }
    .profile-intro-card {
      margin: 0 12px !important;
      padding: 14px 15px !important;
      border-radius: 16px !important;
      background: var(--surface-2,#26343d) !important;
      color: var(--text) !important;
    }
    .profile-intro-card strong { display:block; margin-bottom:4px; font-size:14px; }
    .profile-intro-card span { display:block; color:var(--text-2); font-size:12.5px; line-height:1.45; }
    @media (max-height: 720px) {
      .business-profile .profile-hero { padding-top: 14px !important; padding-bottom: 8px !important; }
      .business-profile .profile-avatar-large { width:72px !important; height:72px !important; }
      .business-profile .profile-actions { margin-top: 9px !important; }
      .business-profile .profile-action { min-height: 48px !important; height:48px !important; }
      .business-profile .profile-disclaimer { display:none !important; }
    }
  `;
  document.head.appendChild(style);

  function relocateLocation() {
    const section = document.getElementById('location-section');
    const messages = document.getElementById('messages');
    const conversation = messages?.querySelector('.conversation');
    if (!section || !messages || !conversation || section.classList.contains('location-persistent')) return;
    section.classList.add('location-persistent');
    messages.insertBefore(section, conversation);
  }

  function enrichProfile() {
    const profile = document.getElementById('business-profile');
    const hero = profile?.querySelector('.profile-hero');
    if (!profile || !hero || profile.querySelector('.profile-intro-card')) return;

    const description = document.getElementById('business-description-text')?.textContent?.trim();
    const status = document.getElementById('business-status-text')?.textContent?.trim();
    const category = document.getElementById('business-profile-category')?.textContent?.trim();
    const text = description || status || (category ? `Perfil oficial · ${category}` : 'Perfil oficial');

    const card = document.createElement('section');
    card.className = 'profile-intro-card';
    card.innerHTML = `<strong>Información</strong><span>${escapeHtml(text)}</span>`;
    const actions = profile.querySelector('.profile-actions');
    actions?.insertAdjacentElement('afterend', card);
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function run() {
    relocateLocation();
    enrichProfile();
  }

  run();
  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList:true, subtree:true });
  window.setTimeout(() => observer.disconnect(), 12000);
})();
