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
  return `${h}:${m}:00`;
}

// Endpoint 1: Verfügbarkeit prüfen
app.post('/check-availability', async (req, res) => {
  const { company, token, app_token, datum, uhrzeit, service_id, provider_id, dauer } = req.body;
  try {
    const response = await axios.post('https://user-api.simplybook.me/admin/', {
      jsonrpc: '2.0',
      method: 'getAvailableTimeIntervals',
      params: [datum, datum, service_id, provider_id || null],
      id: 1
    }, {
      headers: {
        'X-Company-Login': company,
        'X-User-Token': token,
        'X-Application-Token': app_token
      }
    });

    const slots = response.data.result;
    const uhrzeit_min = timeToMinutes(uhrzeit);
    const end_min = uhrzeit_min + dauer;
    let verfuegbare_mitarbeiter = [];

    for (const [provider, intervals] of Object.entries(slots[datum] || {})) {
      for (const interval of intervals) {
        const from_min = timeToMinutes(interval.from);
        const to_min = timeToMinutes(interval.to);
        if (from_min <= uhrzeit_min && to_min >= end_min) {
          verfuegbare_mitarbeiter.push(parseInt(provider));
          break;
        }
      }
    }

    if (verfuegbare_mitarbeiter.length === 0) {
      return res.json({ verfuegbar: false, nachricht: 'Keine Mitarbeiter verfügbar' });
    }

    if (provider_id && !verfuegbare_mitarbeiter.includes(parseInt(provider_id))) {
      return res.json({ verfuegbar: false, nachricht: 'Gewählter Mitarbeiter nicht verfügbar' });
    }

    const gewaehlter_provider = provider_id ? parseInt(provider_id) : verfuegbare_mitarbeiter[0];

    return res.json({ 
      verfuegbar: true, 
      provider_id: gewaehlter_provider
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Endpoint 2: Freie Slots holen
app.post('/get-available-slots', async (req, res) => {
  const { company, token, app_token, datum, service_id, dauer } = req.body;
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
    const freie_zeiten = new Set();

    for (const intervals of Object.values(slots[datum] || {})) {
      for (const interval of intervals) {
        const from_min = timeToMinutes(interval.from);
        const to_min = timeToMinutes(interval.to);
        let current = from_min;
        while (current + dauer <= to_min) {
          freie_zeiten.add(minutesToTime(current));
          current += 30;
        }
      }
    }

    const zeiten_liste = [...freie_zeiten].sort();

    if (zeiten_liste.length === 0) {
      return res.json({ verfuegbar: false, freie_zeiten: [] });
    }

    return res.json({ verfuegbar: true, freie_zeiten: zeiten_liste.slice(0, 5) });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
