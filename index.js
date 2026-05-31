const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/check-availability', async (req, res) => {
  const { company, token, app_token, datum, uhrzeit, service_id, provider_id, dauer } = req.body;

  try {
    // Verfügbarkeit prüfen
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

    // Verfügbare Mitarbeiter finden
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

    // Wenn provider_id gewählt → prüfen ob verfügbar
    if (provider_id && !verfuegbare_mitarbeiter.includes(provider_id)) {
      return res.json({ verfuegbar: false, nachricht: 'Gewählter Mitarbeiter nicht verfügbar' });
    }

    // Ersten verfügbaren Mitarbeiter nehmen wenn keiner gewählt
    const gewaehlter_provider = provider_id || verfuegbare_mitarbeiter[0];

    return res.json({ 
      verfuegbar: true, 
      provider_id: gewaehlter_provider,
      alle_verfuegbaren: verfuegbare_mitarbeiter
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
