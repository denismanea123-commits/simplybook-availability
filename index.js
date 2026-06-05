const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

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

const MITARBEITER = {
  2: 'Avni',
  3: 'Besa',
  4: 'Lidia',
  5: 'Eddy'
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
  16: { name: 'Boys Haarschnitt 11-15',       dauer: 30,  preis: 0  }
};

const ADDONS = {
  1: { name: 'Augenbrauen zupfen',              dauer: 10, preis: 12 },
  2: { name: 'Augenbrauen färben',              dauer: 10, preis: 9  },
  3: { name: 'Bartrasur & Pflege',              dauer: 15, preis: 15 },
  4: { name: 'Facewaxing',                      dauer: 15, preis: 25 },
  5: { name: 'Gesichtentharung Fadentechnik',   dauer: 15, preis: 20 },
  6: { name: 'Wimpern färben',                  dauer: 20, preis: 15 },
  7: { name: 'Waschen, Schneiden & Stylen',     dauer: 80, preis: 49 },
  8: { name: 'Cut & Go',                        dauer: 50, preis: 34 },
  9: { name: 'Waschen & Stylen',                dauer: 25, preis: 24 }
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
  16: []
};

function getFreieZeiten(intervals, dauer) {
  const einzelne = [];
  const bloecke = [];
  for (const interval of intervals) {
    const from_min = timeToMinutes(interval.from);
    const to_min = timeToMinutes(interval.to);
    const dauer_interval = to_min - from_min;
    if (dauer_interval < dauer) continue;
    let anzahl = 0;
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


// Route to get additional field hash - auto login
app.get('/get-field-hash', async (req, res) => {
  try {
    // Schritt 1: Login mit User-API-Key (3. Parameter = der echte Key)
    const loginResp = await axios.post('https://user-api.simplybook.me/login', {
      jsonrpc: '2.0',
      method: 'getUserToken',
      params: ['dein', 'denismanea123@gmail.com', 'api_user_key_V6FI_amUWGrTIlaQtREmYZ8ftMTOPSI8Sftxc0Dlg2Q'],
      id: 1
    });

    const token = loginResp.data.result;
    if (!token) {
      return res.status(400).json({ step: 'login', error: loginResp.data.error || 'Kein Token erhalten' });
    }

    // Schritt 2: Zusatzfelder für Service 7 abrufen
    const response = await axios.post('https://user-api.simplybook.me/admin/', {
      jsonrpc: '2.0',
      method: 'getAdditionalFields',
      params: [7],
      id: 1
    }, {
      headers: {
        'X-Company-Login': 'dein',
        'X-User-Token': token,
        'X-Application-Token': 'eb308f30b177027286a6019b55464eaa180f0f64f5c466ba729183a48cc15019'
      }
    });

    return res.json(response.data);
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      detail: error.response ? error.response.data : null
    });
  }
});

app.post('/get-pricing', (req, res) => {
  const { service_id, addon_ids } = req.body;
  const sid = parseInt(service_id);
  const service = SERVICES[sid];

  if (!service) {
    return res.status(400).json({ error: `Unbekannter Service: ${service_id}` });
  }

  const erlaubt = ERLAUBTE_ADDONS[sid] || [];
  let gesamt_dauer = service.dauer;
  let gesamt_preis = service.preis;
  let zeilen = [];

  if (service.preis > 0) {
    zeilen.push(`${service.name} (${service.dauer} Min) - ${service.preis} €`);
  } else {
    zeilen.push(`${service.name} (${service.dauer} Min)`);
  }

  const ids = Array.isArray(addon_ids) ? addon_ids : (addon_ids !== undefined && addon_ids !== null ? [addon_ids] : []);
  for (const aid of ids) {
    const aid_int = parseInt(aid);
    if (!erlaubt.includes(aid_int)) continue;
    const addon = ADDONS[aid_int];
    if (!addon) continue;
    gesamt_dauer += addon.dauer;
    gesamt_preis += addon.preis;
    zeilen.push(`+ ${addon.name} (${addon.dauer} Min) - ${addon.preis} €`);
  }

  if (gesamt_preis > 0) {
    zeilen.push(`Gesamt: ${gesamt_dauer} Min | ${gesamt_preis} €`);
  } else {
    zeilen.push(`Gesamt: ${gesamt_dauer} Min`);
  }

  const kommentar_text = zeilen.join(' | ');

  return res.json({
    gesamt_dauer,
    gesamt_preis,
    kommentar_text
  });
});

app.post('/check-availability', async (req, res) => {
  const { company, token, app_token, datum, uhrzeit, service_id, provider_id, dauer } = req.body;
  try {
    const response = await axios.post('https://user-api.simplybook.me/admin/', {
      jsonrpc: '2.0',
      method: 'getAvailableTimeIntervals',
      params: [datum, datum, parseInt(service_id), provider_id ? parseInt(provider_id) : null],
      id: 1
    }, {
      headers: {
        'X-Company-Login': company,
        'X-User-Token': token,
        'X-Application-Token': app_token
      }
    });

    if (response.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: response.data.error });
    }

    const slots = response.data.result;
    if (!slots) {
      return res.status(500).json({ error: 'Keine Daten von SimplyBook', raw: response.data });
    }

    const tagesslots = slots[datum] || {};
    const uhrzeit_min = timeToMinutes(uhrzeit);
    const dauer_int = parseInt(dauer);
    const end_min = uhrzeit_min + dauer_int;

    let verfuegbare_mitarbeiter = [];
    for (const [provider, intervals] of Object.entries(tagesslots)) {
      for (const interval of intervals) {
        const from_min = timeToMinutes(interval.from);
        const to_min = timeToMinutes(interval.to);
        if (from_min <= uhrzeit_min && to_min >= end_min) {
          const pid = parseInt(provider);
          verfuegbare_mitarbeiter.push({
            id: pid,
            name: MITARBEITER[pid] || `Mitarbeiter ${pid}`
          });
          break;
        }
      }
    }

    if (verfuegbare_mitarbeiter.length === 0) {
      const pid_check = provider_id && provider_id !== "" ? parseInt(provider_id) : 0;
      if (pid_check && pid_check !== 0) {
        const mitarbeiter_intervals = tagesslots[pid_check] || tagesslots[String(pid_check)] || [];
        const freie_zeiten_mitarbeiter = getFreieZeiten(mitarbeiter_intervals, dauer_int);
        let alle_freie_zeiten = new Set();
        for (const [provider, intervals] of Object.entries(tagesslots)) {
          if (parseInt(provider) === pid_check) continue;
          for (const interval of intervals) {
            const from_min = timeToMinutes(interval.from);
            const to_min = timeToMinutes(interval.to);
            let current = from_min;
            while (current + dauer_int <= to_min) {
              alle_freie_zeiten.add(minutesToTime(current));
              current += 15;
            }
          }
        }
        const andere_verfuegbare_mitarbeiter = [];
        for (const [provider, intervals] of Object.entries(tagesslots)) {
          if (parseInt(provider) === pid_check) continue;
          for (const interval of intervals) {
            const from_min = timeToMinutes(interval.from);
            const to_min = timeToMinutes(interval.to);
            if (from_min <= uhrzeit_min && to_min >= end_min) {
              const pid = parseInt(provider);
              andere_verfuegbare_mitarbeiter.push({
                id: pid,
                name: MITARBEITER[pid] || `Mitarbeiter ${pid}`
              });
              break;
            }
          }
        }
        return res.json({
          verfuegbar: false,
          gewuenschter_mitarbeiter: MITARBEITER[pid_check] || `Mitarbeiter ${pid_check}`,
          freie_zeiten_mitarbeiter: freie_zeiten_mitarbeiter,
          andere_verfuegbare_mitarbeiter: andere_verfuegbare_mitarbeiter
        });
      }
      let alle_freie_zeiten = new Set();
      for (const [provider, intervals] of Object.entries(tagesslots)) {
        for (const interval of intervals) {
          const from_min = timeToMinutes(interval.from);
          const to_min = timeToMinutes(interval.to);
          let current = from_min;
          while (current + dauer_int <= to_min) {
            alle_freie_zeiten.add(minutesToTime(current));
            current += 15;
          }
        }
      }
      const freie_zeiten = Array.from(alle_freie_zeiten).sort().slice(0, 8);
      return res.json({
        verfuegbar: false,
        verfuegbare_mitarbeiter: [],
        freie_zeiten: freie_zeiten
      });
    }

    const pid_raw = provider_id && provider_id !== "" ? parseInt(provider_id) : 0;
    if (pid_raw && pid_raw !== 0) {
      const istFrei = verfuegbare_mitarbeiter.some(m => m.id === pid_raw);
      if (istFrei) {
        return res.json({
          verfuegbar: true,
          verfuegbare_mitarbeiter: verfuegbare_mitarbeiter,
          freie_zeiten: [],
          gewaehlter_mitarbeiter: MITARBEITER[pid_raw] || `Mitarbeiter ${pid_raw}`
        });
      } else {
        const mitarbeiter_intervals = tagesslots[pid_raw] || tagesslots[String(pid_raw)] || [];
        const freie_zeiten_mitarbeiter = getFreieZeiten(mitarbeiter_intervals, dauer_int);
        const andere = verfuegbare_mitarbeiter.filter(m => m.id !== pid_raw);
        return res.json({
          verfuegbar: false,
          gewuenschter_mitarbeiter: MITARBEITER[pid_raw] || `Mitarbeiter ${pid_raw}`,
          freie_zeiten_mitarbeiter: freie_zeiten_mitarbeiter,
          andere_verfuegbare_mitarbeiter: andere
        });
      }
    }

    return res.json({
      verfuegbar: true,
      verfuegbare_mitarbeiter: verfuegbare_mitarbeiter,
      freie_zeiten: []
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/get-available-slots', async (req, res) => {
  const { company, token, app_token, datum, service_id, dauer, provider_id, uhrzeit } = req.body;
  try {
    const response = await axios.post('https://user-api.simplybook.me/admin/', {
      jsonrpc: '2.0',
      method: 'getAvailableTimeIntervals',
      params: [datum, datum, parseInt(service_id), provider_id ? parseInt(provider_id) : null],
      id: 1
    }, {
      headers: {
        'X-Company-Login': company,
        'X-User-Token': token,
        'X-Application-Token': app_token
      }
    });

    if (response.data.error) {
      return res.status(500).json({ error: 'SimplyBook Fehler', detail: response.data.error });
    }

    const slots = response.data.result;
    if (!slots) {
      return res.status(500).json({ error: 'Keine Daten', raw: response.data });
    }

    const tagesslots = slots[datum] || {};
    const dauer_int = parseInt(dauer);

    let freie_zeiten_gewuenscht = [];
    if (provider_id && provider_id !== "") {
      const pid = parseInt(provider_id);
      const intervals = tagesslots[pid] || tagesslots[String(pid)] || [];
      freie_zeiten_gewuenscht = getFreieZeiten(intervals, dauer_int);
    }

    let andere_mitarbeiter = [];
    if (uhrzeit) {
      const uhrzeit_min = timeToMinutes(uhrzeit);
      const end_min = uhrzeit_min + dauer_int;
      for (const [prov_id, intervals] of Object.entries(tagesslots)) {
        if (parseInt(prov_id) === parseInt(provider_id)) continue;
        for (const interval of intervals) {
          const from_min = timeToMinutes(interval.from);
          const to_min = timeToMinutes(interval.to);
          if (from_min <= uhrzeit_min && to_min >= end_min) {
            andere_mitarbeiter.push({
              id: parseInt(prov_id),
              name: MITARBEITER[parseInt(prov_id)] || `Mitarbeiter ${prov_id}`
            });
            break;
          }
        }
      }
    }

    return res.json({
      verfuegbar: freie_zeiten_gewuenscht.length > 0,
      freie_zeiten: freie_zeiten_gewuenscht,
      andere_mitarbeiter: andere_mitarbeiter
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
