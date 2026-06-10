const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ─────────────────────────────────────────────
// KONFIGURATION – pro Kunde anpassen
// In Render.com: Environment Variables setzen
// ─────────────────────────────────────────────
const CONFIG = {
  company:   process.env.SIMPLYBOOK_COMPANY   || 'dein',
  email:     process.env.SIMPLYBOOK_EMAIL     || 'denismanea123@gmail.com',
  apiKey:    process.env.SIMPLYBOOK_API_KEY   || 'api_user_key_lPhbNTR8NMW31apDxxvPtls3WP7CeSI6GgkIl1uwl3c',
  appToken:  process.env.SIMPLYBOOK_APP_TOKEN || 'eb308f30b177027286a6019b55464eaa180f0f64f5c466ba729183a48cc15019',
};

const SIMPLYBOOK_USER_API = 'https://user-api.simplybook.me';
const SIMPLYBOOK_ADMIN    = 'https://user-api.simplybook.me/admin/';

// ─────────────────────────────────────────────
// HILFSFUNKTIONEN
// ─────────────────────────────────────────────
function timeToMinutes(time) {
  const clean = time.substring(0, 5);
  const [h, m] = clean.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Holt einen frischen SimplyBook User-Token
async function getSimplyBookToken() {
  const resp = await axios.post(`${SIMPLYBOOK_USER_API}/login`, {
    jsonrpc: '2.0',
    method:  'getUserToken',
    params:  [CONFIG.company, CONFIG.email, CONFIG.apiKey],
    id:      1,
  });
  const token = resp.data?.result;
  if (!token) {
    throw new Error('SimplyBook Login fehlgeschlagen: ' + JSON.stringify(resp.data?.error));
  }
  return token;
}

// Baut den Standard-Header für Admin-API-Calls
function adminHeaders(token) {
  return {
    'X-Company-Login':      CONFIG.company,
    'X-User-Token':         token,
    'X-Application-Token':  CONFIG.appToken,
  };
}

// ─────────────────────────────────────────────
// STAMMDATEN
// ─────────────────────────────────────────────
const MITARBEITER = {
  2: 'Avni',
  3: 'Besa',
  4: 'Lidia',
  5: 'Eddy',
};

const SERVICES = {
  2:  { name: 'Cut & Go',                    dauer: 50,  preis: 34 },
  3:  { name: 'Waschen & Stylen',             dauer: 25,  preis: 24 },
  4:  { name: 'Waschen, Schneiden & Stylen',  dauer: 80,  preis: 49 },
  5:  { name: 'Wash & Cut',                   dauer: 30,  preis: 29 },
  6:  { name: 'Maschinenschnitt',             dauer: 30,  preis: 20 },
  7:  { name: 'Haircut',                      dauer: 30,  preis: 26 },
  8:  { name: 'Farbe / Coloration',           dauer: 65,  preis: 40 },
  9:  { name: 'Foliensträhnen ganzer Kopf',   dauer: 90,  preis: 90 },
  10: { name: 'Foliensträhnen Oberkopf',      dauer: 70,  preis: 55 },
  11: { name: 'Balayage',                     dauer: 80,  preis: 90 },
  12: { name: 'Dauerwelle',                   dauer: 60,  preis: 40 },
  13: { name: 'Girls Haarschnitt 0-11',       dauer: 30,  preis: 0  },
  14: { name: 'Girls Haarschnitt 11-15',      dauer: 30,  preis: 0  },
  15: { name: 'Boys Haarschnitt 0-11',        dauer: 30,  preis: 0  },
  16: { name: 'Boys Haarschnitt 11-15',       dauer: 30,  preis: 0  },
};

const ADDONS = {
  1: { name: 'Augenbrauen zupfen',             dauer: 10, preis: 12 },
  2: { name: 'Augenbrauen färben',             dauer: 10, preis: 9  },
  3: { name: 'Bartrasur & Pflege',             dauer: 15, preis: 15 },
  4: { name: 'Facewaxing',                     dauer: 15, preis: 25 },
  5: { name: 'Gesichtentharung Fadentechnik',  dauer: 15, preis: 20 },
  6: { name: 'Wimpern färben',                 dauer: 20, preis: 15 },
  7: { name: 'Waschen, Schneiden & Stylen',    dauer: 80, preis: 49 },
  8: { name: 'Cut & Go',                       dauer: 50, preis: 34 },
  9: { name: 'Waschen & Stylen',               dauer: 25, preis: 24 },
};

const ERLAUBTE_ADDONS = {
  2:  [1,2,3,4,5,6],
  3:  [1,2,3,4,5,6],
  4:  [1,2,3,4,5,6],
  5:  [1,2,3,4,5,6],
  6:  [1,2,3,4,5,6],
  7:  [1,2,3,4,5,6],
  8:  [1,2,3,4,5,6,7,8,9],
  9:  [1,2,3,4,5,6,7,8,9],
  10: [1,2,3,4,5,6,7,8,9],
  11: [1,2,3,4,5,6,7,8,9],
  12: [1,2,3,4,5,6,7,8,9],
  13: [],
  14: [],
  15: [],
  16: [],
};

// ─────────────────────────────────────────────
// KERNFUNKTION: Freie Zeitslots berechnen
// ─────────────────────────────────────────────
function getFreieZeiten(intervals, dauer) {
  const einzelne = [];
  const bloecke  = [];

  for (const interval of intervals) {
    const from_min = timeToMinutes(interval.from);
    const to_min   = timeToMinutes(interval.to);
    if (to_min - from_min < dauer) continue;

    // Zähle mögliche Slots (15-Min-Raster)
    let anzahl  = 0;
    let current = from_min;
    while (current + dauer <= to_min) { anzahl++; current += 15; }

    if (anzahl <= 4) {
      current = from_min;
      while (current + dauer <= to_min) {
        einzelne.push(minutesToTime(current));
        current += 15;
      }
    } else {
      bloecke.push(`ab ${minutesToTime(from_min)} bis ${minutesToTime(to_min)} Uhr`);
    }
  }

  return [...einzelne, ...bloecke];
}

// ─────────────────────────────────────────────
// ROUTE: Additional Field Hash (Auto-Login)
// ─────────────────────────────────────────────
app.get('/get-field-hash', async (req, res) => {
  try {
    const token = await getSimplyBookToken();
    const sid = parseInt(req.query.service_id) || 7;

    const fieldsResp = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getAdditionalFields',
      params:  [sid],
      id:      1,
    }, { headers: adminHeaders(token) });

    const requireResp = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getCompanyParam',
      params:  ['require_fields'],
      id:      1,
    }, { headers: adminHeaders(token) });

    return res.json({
      service_id:      sid,
      additionalFields: fieldsResp.data.result,
      require_fields:   requireResp.data.result,
    });
  } catch (error) {
    return res.status(500).json({
      error:  error.message,
      detail: error.response?.data ?? null,
    });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Preis & Dauer berechnen
// ─────────────────────────────────────────────
app.post('/get-pricing', (req, res) => {
  const { service_id, addon_ids } = req.body;
  const sid     = parseInt(service_id);
  const service = SERVICES[sid];

  if (!service) {
    return res.status(400).json({ error: `Unbekannter Service: ${service_id}` });
  }

  const erlaubt      = ERLAUBTE_ADDONS[sid] || [];
  let gesamt_dauer   = service.dauer;
  let gesamt_preis   = service.preis;
  const zeilen       = [];

  if (service.preis > 0) {
    zeilen.push(`${service.name} (${service.dauer} Min) - ${service.preis} €`);
  } else {
    zeilen.push(`${service.name} (${service.dauer} Min)`);
  }

  const ids = Array.isArray(addon_ids)
    ? addon_ids
    : (addon_ids != null ? [addon_ids] : []);

  for (const aid of ids) {
    const aid_int = parseInt(aid);
    if (!erlaubt.includes(aid_int)) continue;
    const addon = ADDONS[aid_int];
    if (!addon) continue;
    gesamt_dauer += addon.dauer;
    gesamt_preis += addon.preis;
    zeilen.push(`+ ${addon.name} (${addon.dauer} Min) - ${addon.preis} €`);
  }

  zeilen.push(
    gesamt_preis > 0
      ? `Gesamt: ${gesamt_dauer} Min | ${gesamt_preis} €`
      : `Gesamt: ${gesamt_dauer} Min`
  );

  return res.json({
    gesamt_dauer,
    gesamt_preis,
    kommentar_text: zeilen.join(' | '),
  });
});

// ─────────────────────────────────────────────
// ROUTE: Verfügbarkeit prüfen
// ─────────────────────────────────────────────
app.post('/check-availability', async (req, res) => {
  const { company, token, app_token, datum, uhrzeit, service_id, provider_id, dauer } = req.body;

  // Sonntag-Check (Mittag-Timestamp vermeidet Timezone-Probleme)
  const wochentag = new Date(datum + 'T12:00:00').getDay();
  if (wochentag === 0) {
    return res.json({ verfuegbar: false, geschlossen: true, datum });
  }

  try {
    const response = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getAvailableTimeIntervals',
      params:  [datum, datum, parseInt(service_id), null],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    if (response.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: response.data.error });
    }

    const slots      = response.data.result;
    if (!slots) {
      return res.status(500).json({ error: 'Keine Daten von SimplyBook', raw: response.data });
    }

    const tagesslots  = slots[datum] || {};
    const uhrzeit_min = timeToMinutes(uhrzeit);
    const dauer_int   = parseInt(dauer);
    const end_min     = uhrzeit_min + dauer_int;
    const pid_raw     = provider_id && provider_id !== '' ? parseInt(provider_id) : 0;

    // Alle verfügbaren Mitarbeiter für diesen Slot finden
    const verfuegbare_mitarbeiter = [];
    for (const [provider, intervals] of Object.entries(tagesslots)) {
      for (const interval of intervals) {
        const from_min = timeToMinutes(interval.from);
        const to_min   = timeToMinutes(interval.to);
        if (from_min <= uhrzeit_min && to_min >= end_min) {
          const pid = parseInt(provider);
          verfuegbare_mitarbeiter.push({ id: pid, name: MITARBEITER[pid] || `Mitarbeiter ${pid}` });
          break;
        }
      }
    }

    // Kein Mitarbeiter frei
    if (verfuegbare_mitarbeiter.length === 0) {
      if (pid_raw) {
        // Gewünschter Mitarbeiter: seine freien Zeiten + andere verfügbare Mitarbeiter zum gewünschten Slot
        const mitarbeiter_intervals       = tagesslots[pid_raw] || tagesslots[String(pid_raw)] || [];
        const freie_zeiten_mitarbeiter    = getFreieZeiten(mitarbeiter_intervals, dauer_int);
        const andere_verfuegbare_mitarbeiter = [];
        for (const [provider, intervals] of Object.entries(tagesslots)) {
          if (parseInt(provider) === pid_raw) continue;
          for (const interval of intervals) {
            const from_min = timeToMinutes(interval.from);
            const to_min   = timeToMinutes(interval.to);
            if (from_min <= uhrzeit_min && to_min >= end_min) {
              const pid = parseInt(provider);
              andere_verfuegbare_mitarbeiter.push({ id: pid, name: MITARBEITER[pid] || `Mitarbeiter ${pid}` });
              break;
            }
          }
        }
        return res.json({
          verfuegbar:                    false,
          gewuenschter_mitarbeiter:      MITARBEITER[pid_raw] || `Mitarbeiter ${pid_raw}`,
          freie_zeiten_mitarbeiter,
          andere_verfuegbare_mitarbeiter,
        });
      }

      // Kein Mitarbeiter-Wunsch: nächste freie Slots über alle Mitarbeiter
      const alle_freie_zeiten = new Set();
      for (const intervals of Object.values(tagesslots)) {
        for (const interval of intervals) {
          let current = timeToMinutes(interval.from);
          const to    = timeToMinutes(interval.to);
          while (current + dauer_int <= to) {
            alle_freie_zeiten.add(minutesToTime(current));
            current += 15;
          }
        }
      }
      return res.json({
        verfuegbar:             false,
        verfuegbare_mitarbeiter: [],
        freie_zeiten:            Array.from(alle_freie_zeiten).sort().slice(0, 8),
      });
    }

    // Mitarbeiter sind frei – wurde ein bestimmter gewünscht?
    if (pid_raw) {
      const istFrei = verfuegbare_mitarbeiter.some(m => m.id === pid_raw);
      if (istFrei) {
        return res.json({
          verfuegbar:            true,
          verfuegbare_mitarbeiter,
          freie_zeiten:          [],
          gewaehlter_mitarbeiter: MITARBEITER[pid_raw] || `Mitarbeiter ${pid_raw}`,
        });
      }
      // Gewünschter Mitarbeiter nicht frei, aber andere schon
      const mitarbeiter_intervals    = tagesslots[pid_raw] || tagesslots[String(pid_raw)] || [];
      const freie_zeiten_mitarbeiter = getFreieZeiten(mitarbeiter_intervals, dauer_int);
      return res.json({
        verfuegbar:                   false,
        gewuenschter_mitarbeiter:     MITARBEITER[pid_raw] || `Mitarbeiter ${pid_raw}`,
        freie_zeiten_mitarbeiter,
        andere_verfuegbare_mitarbeiter: verfuegbare_mitarbeiter.filter(m => m.id !== pid_raw),
      });
    }

    return res.json({ verfuegbar: true, verfuegbare_mitarbeiter, freie_zeiten: [] });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Freie Slots für einen Mitarbeiter/Tag
// ─────────────────────────────────────────────
app.post('/get-available-slots', async (req, res) => {
  const { company, token, app_token, datum, service_id, dauer, provider_id, uhrzeit } = req.body;

  // Sonntag-Check
  const wochentag = new Date(datum + 'T12:00:00').getDay();
  if (wochentag === 0) {
    return res.json({ geschlossen: true, datum });
  }

  try {
    const response = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getAvailableTimeIntervals',
      params:  [datum, datum, parseInt(service_id), null],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    if (response.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: response.data.error });
    }
    const slots = response.data.result;
    if (!slots) {
      return res.status(500).json({ error: 'Keine Daten', raw: response.data });
    }

    const tagesslots = slots[datum] || {};
    const dauer_int  = parseInt(dauer);

    // Freie Zeiten des gewünschten Mitarbeiters
    let freie_zeiten_gewuenscht = [];
    if (provider_id && provider_id !== '') {
      const pid       = parseInt(provider_id);
      const intervals = tagesslots[pid] || tagesslots[String(pid)] || [];
      freie_zeiten_gewuenscht = getFreieZeiten(intervals, dauer_int);
    }

    // Andere Mitarbeiter die zum gewünschten Zeitpunkt frei wären
    let andere_mitarbeiter = [];
    if (uhrzeit) {
      const uhrzeit_min = timeToMinutes(uhrzeit);
      const end_min     = uhrzeit_min + dauer_int;
      for (const [prov_id, intervals] of Object.entries(tagesslots)) {
        if (parseInt(prov_id) === parseInt(provider_id)) continue;
        for (const interval of intervals) {
          const from_min = timeToMinutes(interval.from);
          const to_min   = timeToMinutes(interval.to);
          if (from_min <= uhrzeit_min && to_min >= end_min) {
            const pid = parseInt(prov_id);
            andere_mitarbeiter.push({ id: pid, name: MITARBEITER[pid] || `Mitarbeiter ${prov_id}` });
            break;
          }
        }
      }
    }

    return res.json({
      verfuegbar:    freie_zeiten_gewuenscht.length > 0,
      freie_zeiten:  freie_zeiten_gewuenscht,
      andere_mitarbeiter,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Debug – roher SimplyBook Output
// ─────────────────────────────────────────────
app.post('/debug-booking', async (req, res) => {
  const { company, token, app_token, datum } = req.body;
  try {
    const response = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getBookings',
      params:  [{ date_from: datum, date_to: datum }],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    const bookings = response.data.result;
    return res.json({
      erster_eintrag: bookings?.length > 0 ? bookings[0] : null,
      anzahl:         bookings?.length ?? 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Termin suchen (nur Name, alle zukünftigen Termine)
// ─────────────────────────────────────────────
app.post('/find-booking', async (req, res) => {
  const { company, token, app_token, name } = req.body;

  if (!company || !token || !app_token || !name) {
    return res.status(400).json({
      error: 'Fehlende Parameter: company, token, app_token, name erforderlich',
    });
  }

  // Heute bis 6 Monate in die Zukunft suchen
  // Datum in deutscher Zeit (UTC+2) berechnen
  const nowDE = new Date(new Date().getTime() + 2 * 60 * 60 * 1000);
  const heute = nowDE.toISOString().substring(0, 10);
  const bisDate = new Date();
  bisDate.setMonth(bisDate.getMonth() + 6);
  const bis = bisDate.toISOString().substring(0, 10);

  try {
    const response = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getBookings',
      params:  [{ date_from: heute, date_to: bis }],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    if (response.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: response.data.error });
    }

    const bookings = response.data.result;
    if (!Array.isArray(bookings)) {
      return res.json({ gefunden: false, buchungen: [] });
    }

    // Nach Name filtern (Groß/Kleinschreibung egal)
    const nameLower = name.toLowerCase().trim();
    const treffer   = bookings.filter(b => {
      const fname    = (b.client_name || '').toLowerCase();
      const fullName = (b.client      || '').toLowerCase();
      return fname.includes(nameLower) || fullName.includes(nameLower);
    });

    if (treffer.length === 0) {
      return res.json({ gefunden: false, buchungen: [] });
    }

    // Details zu jedem Treffer laden
    const result = await Promise.all(treffer.map(async (b) => {
      try {
        const detailResp = await axios.post(SIMPLYBOOK_ADMIN, {
          jsonrpc: '2.0',
          method:  'getBookingDetails',
          params:  [parseInt(b.id)],
          id:      1,
        }, {
          headers: {
            'X-Company-Login':     company,
            'X-User-Token':        token,
            'X-Application-Token': app_token,
          },
        });

        const d       = detailResp.data.result || {};
        const startDT = d.start_date_time || d.start_datetime || '';
        const datumStr = startDT ? startDT.substring(0, 10) : '';
        const uhrzeitStr = startDT ? startDT.substring(11, 16) : '';
        return {
          booking_id:  b.id,
          name:        d.client_name  || d.clientName  || b.client_name || '',
          datum:       datumStr,
          uhrzeit:     uhrzeitStr,
          service:     d.event_name   || d.service_name || d.eventName  || '',
          mitarbeiter: d.unit_name    || d.provider_name || d.unitName  || '',
        };
      } catch {
        return { booking_id: b.id, name: b.client_name || '', datum: '', uhrzeit: '', service: '', mitarbeiter: '' };
      }
    }));

    // Fertige Liste für WhatsApp — mit Datum + Uhrzeit + Service
    const zeilen = result.map((t, i) => {
      const datumFormatiert = t.datum
        ? new Date(t.datum + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      return `${i + 1}. ${datumFormatiert} – ${t.uhrzeit} Uhr – ${t.service}`;
    }).join('\n');

    let liste_text = '';
    if (result.length === 1) {
      const t = result[0];
      const datumFormatiert = t.datum
        ? new Date(t.datum + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      liste_text = `Ich habe folgenden Termin gefunden für ${t.name}:\n\n• ${datumFormatiert} – ${t.uhrzeit} Uhr – ${t.service}\n\nMöchten Sie diesen Termin stornieren? (Ja / Nein)`;
    } else {
      liste_text = `Ich habe folgende Termine gefunden für ${result[0].name}:\n\n${zeilen}\n\nWelchen Termin möchten Sie stornieren? Bitte Nummer eingeben.`;
    }

    return res.json({ gefunden: true, buchungen: result, liste_text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});


// ─────────────────────────────────────────────
// ROUTE: Termin per Wahl-Nummer stornieren
// name + wahl → sucht Termine, wählt den richtigen, storniert
// ─────────────────────────────────────────────
app.post('/select-and-cancel', async (req, res) => {
  const { company, token, app_token, name, wahl } = req.body;

  if (!company || !token || !app_token || !name || !wahl) {
    return res.status(400).json({
      error: 'Fehlende Parameter: company, token, app_token, name, wahl erforderlich',
    });
  }

  const wahlInt = parseInt(wahl);

  try {
    // 1. Termine suchen
    const nowDE = new Date(new Date().getTime() + 2 * 60 * 60 * 1000);
    const heute = nowDE.toISOString().substring(0, 10);
    const bisDate = new Date(new Date().getTime() + 2 * 60 * 60 * 1000);
    bisDate.setMonth(bisDate.getMonth() + 6);
    const bis = bisDate.toISOString().substring(0, 10);

    const bookingsResp = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'getBookings',
      params:  [{ date_from: heute, date_to: bis }],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    const bookings = bookingsResp.data.result;
    if (!Array.isArray(bookings)) {
      return res.status(500).json({ error: 'Keine Termine gefunden' });
    }

    // 2. Nach Name filtern
    const nameLower = name.toLowerCase().trim();
    const treffer = bookings.filter(b => {
      const fname    = (b.client_name || '').toLowerCase();
      const fullName = (b.client      || '').toLowerCase();
      return fname.includes(nameLower) || fullName.includes(nameLower);
    });

    if (treffer.length === 0) {
      return res.json({ erfolg: false, fehler: 'Kein Termin gefunden' });
    }

    if (wahlInt < 1 || wahlInt > treffer.length) {
      return res.status(400).json({ error: `Ungültige Wahl: ${wahl}` });
    }

    // 3. Gewählten Termin stornieren
    const booking_id = parseInt(treffer[wahlInt - 1].id);

    const cancelResp = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'cancelBooking',
      params:  [booking_id],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    if (cancelResp.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: cancelResp.data.error });
    }

    const success = cancelResp.data.result === true || cancelResp.data.result === 1;
    return res.json({ erfolg: success, booking_id });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Termin stornieren
// ─────────────────────────────────────────────
app.post('/cancel-booking', async (req, res) => {
  const { company, token, app_token, booking_id } = req.body;

  if (!company || !token || !app_token || !booking_id) {
    return res.status(400).json({
      error: 'Fehlende Parameter: company, token, app_token, booking_id erforderlich',
    });
  }

  try {
    const response = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'cancelBooking',
      params:  [parseInt(booking_id)],
      id:      1,
    }, {
      headers: {
        'X-Company-Login':     company,
        'X-User-Token':        token,
        'X-Application-Token': app_token,
      },
    });

    if (response.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: response.data.error });
    }

    const success = response.data.result === true || response.data.result === 1;
    return res.json({ erfolg: success, booking_id: parseInt(booking_id) });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────
// ROUTE: Termin buchen
// ─────────────────────────────────────────────
app.post('/book', async (req, res) => {
  const { datum, uhrzeit, service_id, provider_id, name, email, phone, addon_ids } = req.body;

  if (!datum || !uhrzeit || !service_id) {
    return res.status(400).json({
      error: 'Fehlende Parameter: datum, uhrzeit, service_id erforderlich',
    });
  }

  try {
    const token = await getSimplyBookToken();
    const sid   = parseInt(service_id);

    const service = SERVICES[sid];
    if (!service) {
      return res.status(400).json({ error: `Unbekannter Service: ${service_id}` });
    }

    // Extras (Add-ons): Dauer + Preis addieren, vollen Preistext bauen (wie get-pricing)
    // addon_ids kann sein: Array [3], String "3", "[3]", "3,1", "[3,1]" oder leer
    const erlaubt = ERLAUBTE_ADDONS[sid] || [];
    let addonIds = [];
    if (Array.isArray(addon_ids)) {
      addonIds = addon_ids;
    } else if (addon_ids != null && String(addon_ids).trim() !== '') {
      addonIds = String(addon_ids)
        .replace(/[\[\]"' ]/g, '')
        .split(',')
        .filter(x => x !== '');
    }
    let extraDauer = 0;
    let extraPreis = 0;
    const preisZeilen = [];
    // Hauptservice-Zeile
    if (service.preis > 0) {
      preisZeilen.push(`${service.name} (${service.dauer} Min) - ${service.preis} €`);
    } else {
      preisZeilen.push(`${service.name} (${service.dauer} Min)`);
    }
    for (const aid of addonIds) {
      const aidInt = parseInt(aid);
      if (isNaN(aidInt)) continue;
      if (!erlaubt.includes(aidInt)) continue;
      const addon = ADDONS[aidInt];
      if (!addon) continue;
      extraDauer += addon.dauer;
      extraPreis += addon.preis;
      preisZeilen.push(`+ ${addon.name} (${addon.dauer} Min) - ${addon.preis} €`);
    }
    const gesamtDauer = service.dauer + extraDauer;
    const gesamtPreis = service.preis + extraPreis;
    preisZeilen.push(
      gesamtPreis > 0
        ? `Gesamt: ${gesamtDauer} Min | ${gesamtPreis} €`
        : `Gesamt: ${gesamtDauer} Min`
    );
    const kommentarText = preisZeilen.join(' | ');

    const startTime = uhrzeit.substring(0, 5) + ':00';
    const startMin  = timeToMinutes(uhrzeit);
    const endTime   = minutesToTime(startMin + gesamtDauer) + ':00';

    // provider_id: falls leer -> automatisch freien Mitarbeiter zum Slot wählen
    let pid = provider_id && String(provider_id).trim() !== '' ? parseInt(provider_id) : null;
    if (!pid) {
      const slotResp = await axios.post(SIMPLYBOOK_ADMIN, {
        jsonrpc: '2.0',
        method:  'getAvailableTimeIntervals',
        params:  [datum, datum, sid, null],
        id:      1,
      }, { headers: adminHeaders(token) });

      const tagesslots = (slotResp.data.result || {})[datum] || {};
      const endMin = startMin + gesamtDauer;
      for (const [prov, intervals] of Object.entries(tagesslots)) {
        for (const interval of intervals) {
          const from = timeToMinutes(interval.from);
          const to   = timeToMinutes(interval.to);
          if (from <= startMin && to >= endMin) { pid = parseInt(prov); break; }
        }
        if (pid) break;
      }
      if (!pid) {
        return res.status(409).json({ erfolg: false, fehler: 'Kein freier Mitarbeiter zu diesem Zeitpunkt' });
      }
    }

    // 1. Client anlegen / holen -> liefert clientId (Zahl)
    // Eindeutige E-Mail + Telefon (wie funktionierender WhatsApp-Bot)
    const stamp = Date.now().toString().slice(-9);
    const clientEmail = (email && String(email).trim() !== '') ? email : `${stamp}@gmail.com`;
    const clientPhone = (phone && String(phone).trim() !== '') ? phone : `+49${stamp}`;
    const clientResp = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'addClient',
      params:  [{ name: name || 'Kunde', email: clientEmail, phone: clientPhone }],
      id:      1,
    }, { headers: adminHeaders(token) });

    if (clientResp.data.error) {
      return res.status(500).json({ erfolg: false, schritt: 'addClient', fehler: clientResp.data.error });
    }
    const clientId = clientResp.data.result;

    // 2. Buchen mit korrekter Signatur
    // additional: Kommentartext ins Intake-Feld (wie funktionierender WhatsApp-Bot)
    const additional = { "b2c8e5d8f33ea5a1dc20d666650c4a0f": kommentarText };
    const bookResp = await axios.post(SIMPLYBOOK_ADMIN, {
      jsonrpc: '2.0',
      method:  'book',
      params:  [ sid, pid, clientId, datum, startTime, datum, endTime, 0, additional, 1 ],
      id: 1,
    }, { headers: adminHeaders(token) });

    if (bookResp.data.error) {
      return res.status(500).json({ erfolg: false, schritt: 'book', fehler: bookResp.data.error });
    }

    const mitarbeiter_name = MITARBEITER[pid] || `Mitarbeiter ${pid}`;
    return res.json({
      erfolg:           true,
      mitarbeiter:      mitarbeiter_name,
      mitarbeiter_id:   pid,
      datum,
      uhrzeit:          startTime.substring(0, 5),
      service:          service.name,
      extras:           kommentarText,
      buchung:          bookResp.data.result,
    });

  } catch (error) {
    return res.status(500).json({ erfolg: false, error: error.message, detail: error.response?.data ?? null });
  }
});

// ─────────────────────────────────────────────
// SERVER START
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
