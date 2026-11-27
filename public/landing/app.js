// CONFIGURACIÓN: Reemplaza este número con el WhatsApp del administrador
// Formato internacional sin signos "+" ni espacios (ej. México: 5213312345678).
const ADMIN_WHATSAPP_NUMBER = '5213300000000';

const DEMO_PROFILES = {
  urbano: {
    dark: false,
    initials: 'CM',
    name: 'Carlos Mendoza',
    city: 'Guadalajara, Jal.',
    blood: 'O+',
    age: '31 años',
    alerts: 'Alergia a Penicilina · Sin otros padecimientos',
    insurance: 'IMSS · UMF 51',
    rel: 'Contacto 1 · Mamá',
    contactName: 'Martha Ruiz',
    phone: '+52 33 1987 6543',
  },
  ruta: {
    dark: true,
    initials: 'AL',
    name: 'Andrea López',
    city: 'Querétaro, Qro.',
    blood: 'A-',
    age: '28 años',
    alerts: 'Usa lentes de contacto · Asma leve',
    insurance: 'Gastos Médicos GNP · Póliza 4820',
    rel: 'Contacto 1 · Pareja',
    contactName: 'Diego Torres',
    phone: '+52 44 2145 8890',
  },
};

function buildWhatsAppUrl(message, customDigits) {
  const rawDigits =
    customDigits === undefined ? ADMIN_WHATSAPP_NUMBER : customDigits;
  const digits = String(rawDigits).replace(/\D/g, '');
  const text = encodeURIComponent(message);
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

function launchWhatsApp(message, customDigits) {
  const url = buildWhatsAppUrl(message, customDigits);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// 1. Mobile Navigation Drawer
(function initMobileMenu() {
  const btn = document.getElementById('mobileMenuBtn');
  const nav = document.getElementById('mobileNav');
  if (!btn || !nav) return;

  function setOpen(open) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    nav.hidden = !open;
  }

  btn.addEventListener('click', () => {
    setOpen(nav.hidden);
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !nav.hidden) {
      setOpen(false);
      btn.focus();
    }
  });
})();

// 2. Interactive Emergency Card Simulator
(function initCardSimulator() {
  let activeKey = 'urbano';
  const tabs = document.querySelectorAll('[data-profile]');
  const screen = document.getElementById('demoPhoneScreen');
  const callBtn = document.getElementById('demoCallBtn');
  const simWaBtn = document.getElementById('demoSimWaBtn');
  const simWaLabel = document.getElementById('demoWaLabel');

  const els = {
    avatar: document.getElementById('demoAvatar'),
    name: document.getElementById('demoName'),
    city: document.getElementById('demoCity'),
    blood: document.getElementById('demoBlood'),
    age: document.getElementById('demoAge'),
    alerts: document.getElementById('demoAlerts'),
    insurance: document.getElementById('demoInsurance'),
    rel: document.getElementById('demoRel'),
    contactName: document.getElementById('demoContactName'),
    phone: document.getElementById('demoPhone'),
  };

  function renderProfile(key) {
    const p = DEMO_PROFILES[key];
    if (!p) return;
    activeKey = key;
    if (screen) {
      screen.classList.toggle('is-dark', Boolean(p.dark));
    }
    els.avatar.textContent = p.initials;
    els.name.textContent = p.name;
    els.city.textContent = p.city;
    els.blood.textContent = p.blood;
    els.age.textContent = p.age;
    els.alerts.textContent = p.alerts;
    els.insurance.textContent = p.insurance;
    els.rel.textContent = p.rel;
    els.contactName.textContent = p.contactName;
    els.phone.textContent = p.phone;
    if (callBtn) {
      callBtn.setAttribute('href', `tel:${p.phone.replace(/\s+/g, '')}`);
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      renderProfile(tab.getAttribute('data-profile'));
    });
  });

  if (simWaBtn) {
    let readyMessage = '';
    simWaBtn.addEventListener('click', () => {
      if (readyMessage) {
        launchWhatsApp(readyMessage, '');
        return;
      }

      const p = DEMO_PROFILES[activeKey];
      const baseText = `EMERGENCIA CASCOQR (Prueba): Escaneé el casco de ${p.name} (${p.blood}).`;
      const openWithCoords = (coordsText) => {
        readyMessage = `${baseText} ${coordsText}`;
        if (simWaLabel) simWaLabel.textContent = 'Abrir WhatsApp con ubicación';
        simWaBtn.disabled = false;
        launchWhatsApp(readyMessage, '');
      };

      if (!navigator.geolocation) {
        openWithCoords(`Ubicación aproximada: ${p.city}`);
        return;
      }

      simWaBtn.disabled = true;
      if (simWaLabel) simWaLabel.textContent = 'Obteniendo GPS real...';

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude.toFixed(6);
          const lng = pos.coords.longitude.toFixed(6);
          openWithCoords(`Esta es la ubicación actual: https://maps.google.com/?q=${lat},${lng}`);
        },
        () => {
          openWithCoords(`Ubicación de muestra: https://maps.google.com/?q=20.676667,-103.347500`);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 },
      );
    });

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        readyMessage = '';
        if (simWaLabel) simWaLabel.textContent = 'Probar envío real por WhatsApp';
      });
    });
  }
})();

// 3. Direct WhatsApp Order Configurator
(function initOrderForm() {
  const form = document.getElementById('waOrderForm');
  const preview = document.getElementById('waPreviewText');
  const errorEl = document.getElementById('orderError');
  if (!form || !preview) return;

  const nameInput = document.getElementById('orderName');
  const cityInput = document.getElementById('orderCity');
  const notesInput = document.getElementById('orderNotes');

  function getComposedMessage() {
    const selectedPack =
      form.querySelector('input[name="pack"]:checked')?.value || '1 CascoQR Personal';
    const name = nameInput.value.trim();
    const city = cityInput.value.trim();
    const notes = notesInput.value.trim();

    const parts = [`Hola, me interesa pedir: ${selectedPack}.`];
    if (name) parts.push(`Mi nombre es ${name}.`);
    if (city) parts.push(`Ciudad: ${city}.`);
    if (notes) parts.push(`Notas: ${notes}.`);
    parts.push('¿Me compartes precios y tiempos de entrega?');
    return parts.join(' ');
  }

  function updatePreview() {
    preview.textContent = getComposedMessage();
  }

  form.addEventListener('input', () => {
    if (errorEl) errorEl.hidden = true;
    updatePreview();
  });

  form.addEventListener('change', updatePreview);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!nameInput.value.trim()) {
      if (errorEl) {
        errorEl.textContent = 'Escribe tu nombre para personalizar el mensaje de WhatsApp.';
        errorEl.hidden = false;
      }
      nameInput.focus();
      return;
    }

    launchWhatsApp(getComposedMessage());
  });

  updatePreview();
})();

// 4. Quick WhatsApp Shortcuts (Hero / Float / Header)
(function initQuickWhatsappLinks() {
  const floatBtn = document.getElementById('waFloatBtn');
  if (floatBtn) {
    floatBtn.addEventListener('click', (e) => {
      e.preventDefault();
      launchWhatsApp('Hola, vi CascoQR y quiero pedir mi sticker de emergencia.');
    });
  }
})();

// 5. FAQ Accordion + Footer Year
(function initFaqAndFooter() {
  const triggers = document.querySelectorAll('.faq-trigger');
  triggers.forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      const panel = btn.nextElementSibling;
      const icon = btn.querySelector('.faq-icon');
      btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (panel) panel.hidden = expanded;
      if (icon) icon.textContent = expanded ? '+' : '−';
    });
  });

  const yearEl = document.getElementById('footerYear');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
