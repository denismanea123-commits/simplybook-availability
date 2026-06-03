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

    // Alle verfügbaren Mitarbeiter zur gewünschten Zeit
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

    // Wenn kein Mitarbeiter frei
    if (verfuegbare_mitarbeiter.length === 0) {
      let freie_zeiten = [];
      for (const [provider, intervals] of Object.entries(tagesslots)) {
        for (const interval of intervals) {
          const from_min = timeToMinutes(interval.from);
          const to_min = timeToMinutes(interval.to);
          let current = from_min;
          while (current + dauer <= to_min) {
            const zeit = minutesToTime(current);
            if (!freie_zeiten.includes(zeit)) freie_zeiten.push(zeit);
            current += 15;
          }
        }
      }
      freie_zeiten.sort();
      return res.json({
        verfuegbar: false,
        verfuegbare_mitarbeiter: [],
        freie_zeiten: freie_zeiten.slice(0, 8)
      });
    }

    // Wenn spezifischer Mitarbeiter gewünscht
    if (provider_id) {
      const gewuenscht = verfuegbare_mitarbeiter.find(m => m.id === parseInt(provider_id));

      if (gewuenscht) {
        // Gewünschter Mitarbeiter ist frei → alle verfügbaren zurückgeben
        return res.json({
          verfuegbar: true,
          verfuegbare_mitarbeiter: verfuegbare_mitarbeiter,
          freie_zeiten: []
        });
      } else {
        // Gewünschter Mitarbeiter ist NICHT frei
        let freie_zeiten_mitarbeiter = [];
        if (tagesslots[provider_id]) {
          const einzelne = [];
          const bloecke = [];
          for (const interval of tagesslots[provider_id]) {
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
          freie_zeiten_mitarbeiter = [...einzelne, ...bloecke];
        }

        return res.json({
          verfuegbar: false,
          gewuenschter_mitarbeiter: MITARBEITER[parseInt(provider_id)] || `Mitarbeiter ${provider_id}`,
          freie_zeiten_mitarbeiter: freie_zeiten_mitarbeiter,
          andere_verfuegbare_mitarbeiter: verfuegbare_mitarbeiter
        });
      }
    }

    // Kein spezifischer Mitarbeiter → alle verfügbaren zurückgeben
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
    if (provider_id && tagesslots[provider_id]) {
      const einzelne_slots = [];
      const bloecke = [];
      for (const interval of tagesslots[provider_id]) {
        const from_min = timeToMinutes(interval.from);
        const to_min = timeToMinutes(interval.to);
        const dauer_interval = to_min - from_min;
        if (dauer_interval < dauer) continue;
        let anzahl_slots = 0;
        let current = from_min;
        while (current + dauer <= to_min) { anzahl_slots++; current += dauer; }
        if (anzahl_slots <= 3) {
          current = from_min;
          while (current + dauer <= to_min) {
            einzelne_slots.push(minutesToTime(current));
            current += dauer;
          }
        } else {
          bloecke.push(`ab ${minutesToTime(from_min)} bis ${minutesToTime(to_min)} Uhr`);
        }
      }
      freie_zeiten_gewuenscht = [...einzelne_slots, ...bloecke];
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
            andere_mitarbeiter.push(MITARBEITER[parseInt(prov_id)] || `Mitarbeiter ${prov_id}`);
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
