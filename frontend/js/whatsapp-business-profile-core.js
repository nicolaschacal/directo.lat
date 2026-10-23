(() => {
  const profile = document.getElementById('business-profile');
  if (!profile) return;

  const actions = profile.querySelector('.profile-actions');
  const shareButton = document.getElementById('business-share');
  const mapLink = document.getElementById('business-map-link');
  const contactHeader = document.getElementById('contact-header');
  const profileBack = document.getElementById('business-profile-back');
  const heroSubtitle = profile.querySelector('.profile-hero > p');

  const icon = (path) => `<span class="profile-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="${path}"/></svg></span>`;

  function startContact() {
    profileBack?.click();
    window.setTimeout(() => contactHeader?.click(), 220);
  }

  function addContactAction() {
    if (!actions || document.getElementById('business-contact-action')) return;
    const contact = document.createElement('button');
    contact.id = 'business-contact-action';
    contact.type = 'button';
    contact.className = 'profile-action profile-action--booking';
    contact.title = 'Que me contacte el coordinador de mi zona';
    contact.innerHTML = `${icon('M5 5h14v10H10l-4 4v-4H5z')}<span>Contacto</span>`;
    contact.addEventListener('click', startContact);
    actions.appendChild(contact);
  }

  function addFixedCta() {
    const shell = profile.querySelector('.business-profile-shell');
    if (!shell || shell.querySelector('.profile-cta')) return;
    const cta = document.createElement('div');
    cta.className = 'profile-cta';
    cta.innerHTML = '<button type="button" aria-label="Que me contacte el coordinador de mi zona">Que me contacte el coordinador de mi zona</button>';
    cta.querySelector('button').addEventListener('click', startContact);
    shell.appendChild(cta);
  }

  function polishHero() {
    if (!heroSubtitle) return;
    const description = document.getElementById('business-description-text')?.textContent?.trim() || '';
    const name = document.getElementById('business-profile-name')?.textContent?.trim() || '';
    const prefix = new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*[·•|-]\\s*`, 'i');
    const cleaned = name ? description.replace(prefix, '').trim() : description;
    const category = document.getElementById('business-category-text')?.textContent?.trim() || '';
    heroSubtitle.textContent = cleaned || category;
  }

  function mergeActionsIntoHero() {
    const hero = profile.querySelector('.profile-hero');
    if (hero && actions && actions.parentElement !== hero) hero.appendChild(actions);
  }

  addContactAction();
  mergeActionsIntoHero();
  addFixedCta();
  polishHero();

  const sync = () => polishHero();
  const observer = new MutationObserver(sync);
  const description = document.getElementById('business-description-text');
  if (description) observer.observe(description, { childList: true, characterData: true, subtree: true });
  if (mapLink) observer.observe(mapLink, { attributes: true, attributeFilter: ['href'] });
})();
