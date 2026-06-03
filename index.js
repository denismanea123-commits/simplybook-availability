const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
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
    while (current + dauer <= to_min) { anzahl++; current += dauer; }
    if (anzahl <= 4) {
      current = from_min;
      while (current + dauer <= to_min) {
        einzelne.push(minutesToTime(current));
        current += dauer;
      }
    } else {
      bloecke.push(`ab ${minutesToTime(from_min)} bis ${minutesToTime(to_min)} Uhr`);
    }
  }
  return [...einzelne, ...bloecke];
}

app.post('/check-availability', async (req, res) => {
  const { company, token, app_token, datum, uhrzeit, service_id, provider_id, dauer } = req.body;
  try {
    const response = await axios.post('https://user-api.simplybook.me/admin/', {
      jsonrpc: '2.0',
      method: 'getAvailableTimeIntervals',
      params: [datum, datum, service_id, null],
      id: 1
    }, {
      headers: {
        'X-Company-Login': company,
        'X-User-Token': token,
        'X-Application-Token': app_token
      }
    });

    const slots = response.data.result;
    const tagesslots = slots[datum] || {};
    const uhrzeit_min = timeToMinutes(uhrzeit);
    const end_min = uhrzeit_min + dauer;

    let verfuegbare_mitarbeiter = [];
    for (const [provider, intervals] of Object.entries(tagesslots)) {
      for (const interval of intervals) {
        const from_min = timeToMinutes(interval.from);
        const to_min = timeToMinutes(interval.to);
        if (from_min <= uhrzeit_min && to_min >= end_min) {
          verfuegbare_mitarbeiter.push({
            id: parseInt(provider),
            name: MITARBEITER[parseInt(provider)] || `Mitarbeiter ${provider}`
          });
          break;
        }
      }
    }

    if (verfuegbare_mitarbeiter.length === 0) {
      let alle_freie_zeiten = new Set();
      for (const [provider, intervals] of Object.entries(tagesslots)) {
        for (const interval of intervals) {
          const from_min = timeToMinutes(interval.from);
          const to_min = timeToMinutes(interval.to);
          let current = from_min;
          while (current + dauer <= to_min) {
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

    if (provider_id && provider_id !== "" && parseInt(provider_id) !== 0) {
      const pid = parseInt(provider_id);
      const istFrei = verfuegbare_mitarbeiter.some(m => m.id === pid);

      if (istFrei) {
        return res.json({
          verfuegbar: true,
          verfuegbare_mitarbeiter: verfuegbare_mitarbeiter,
          freie_zeiten: [],
          gewaehlter_mitarbeiter: MITARBEITER[pid] || `Mitarbeiter ${pid}`
        });
      } else {
        const mitarbeiter_intervals = tagesslots[pid] || tagesslots[String(pid)] || [];
        const freie_zeiten_mitarbeiter = getFreieZeiten(mitarbeiter_intervals, dauer);
        const andere = verfuegbare_mitarbeiter.filter(m => m.id !== pid);

        return res.json({
          verfuegbar: false,
          gewuenschter_mitarbeiter: MITARBEITER[pid] || `Mitarbeiter ${pid}`,
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
      params: [datum, datum, service_id, null],
      id: 1
    }, {
      headers: {
        'X-Company-Login': company,
        'X-User-Token': token,
        'X-Application-Token': app_token
      }
    });

    const slots = response.data.result;
    const tagesslots = slots[datum] || {};

    let freie_zeiten_gewuenscht = [];
    if (provider_id) {
      const pid = parseInt(provider_id);
      const intervals = tagesslots[pid] || tagesslots[String(pid)] || [];
      freie_zeiten_gewuenscht = getFreieZeiten(intervals, dauer);
    }

    let andere_mitarbeiter = [];
    if (uhrzeit) {
      const uhrzeit_min = timeToMinutes(uhrzeit);
      const end_min = uhrzeit_min + dauer;
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
