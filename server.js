const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Memori lokal sementara (atau bisa hubungkan ke Supabase/Database)
let dataNotes = [];

// Configuration
const HERMES_API_URL = process.env.HERMES_API_URL || 'http://localhost:3000/v1/chat/completions';
const HERMES_API_KEY = process.env.HERMES_API_KEY || 'sk-dummy-key';

// 1. Endpoint Webhook WhatsApp
app.post('/api/webhook/wa', async (req, res) => {
    try {
        // Ekstrak pesan dari payload WA Gateway (menyesuaikan format Fonnte/Evolution API)
        const rawMessage = req.body.message || req.body.text || req.body.payload?.text;
        const sender = req.body.sender || req.body.from || 'Unknown';

        if (!rawMessage) {
            return res.status(400).json({ status: 'error', message: 'No message found' });
        }

        console.log(`[WA Incoming] Pesan mentah dari ${sender}:`, rawMessage);

        // 2. Olah data mentah menggunakan Hermes AI
        const prompt = `
Kamu adalah asisten pengolah data. Tugasmu adalah mengubah teks mentah acak berikut menjadi JSON terstruktur.

Teks Mentah: "${rawMessage}"

Format JSON yang Wajib Dikembalikan (HANYA JSON, TANPA MARKDOWN):
{
  "judul": "Judul singkat dan jelas",
  "kategori": "Kategori (Tugas/Catatan/Keuangan/Ide/Lainnya)",
  "ringkasan": "Ringkasan poin utama",
  "action_item": ["Langkah 1", "Langkah 2"]
}
`;

        const aiResponse = await axios.post(HERMES_API_URL, {
            model: 'default',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2
        }, {
            headers: { 'Authorization': `Bearer ${HERMES_API_KEY}` }
        });

        let cleanedData;
        try {
            const rawContent = aiResponse.data.choices[0].message.content.trim();
            // Bersihkan format markdown jika AI mengembalikannya dalam kode blok
            const cleanJsonString = rawContent.replace(/```json|```/g, '').trim();
            cleanedData = JSON.parse(cleanJsonString);
        } catch (e) {
            cleanedData = {
                judul: "Catatan Baru",
                kategori: "Uncategorized",
                ringkasan: rawMessage,
                action_item: []
            };
        }

        // 3. Simpan data hasil olahan
        const entry = {
            id: Date.now(),
            sender,
            raw: rawMessage,
            ...cleanedData,
            createdAt: new Date().toLocaleString('id-ID')
        };

        dataNotes.unshift(entry); // Simpan di urutan paling atas
        console.log('[Hermes Processed]:', entry);

        res.status(200).json({ status: 'success', data: entry });
    } catch (error) {
        console.error('Webhook Error:', error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// 2. Endpoint API Data untuk Dashboard
app.get('/api/notes', (req, res) => {
    res.json(dataNotes);
});

// 3. Dashboard Web Minimalis (Tailwind CSS)
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nexus WA Command Vault</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-6 font-sans">
    <div class="max-w-5xl mx-auto">
        <header class="flex justify-between items-center mb-8 border-b border-slate-800 pb-4">
            <div>
                <h1 class="text-2xl font-bold text-indigo-400">⚡ Nexus WA Vault</h1>
                <p class="text-sm text-slate-400">Otomatisasi Catatan WhatsApp via Hermes AI</p>
            </div>
            <button onclick="fetchNotes()" class="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-medium transition">
                Sync Data
            </button>
        </header>

        <div id="notes-container" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Data bakal dimuat di sini -->
        </div>
    </div>

    <script>
        async function fetchNotes() {
            const res = await fetch('/api/notes');
            const data = await res.json();
            const container = document.getElementById('notes-container');
            
            if (data.length === 0) {
                container.innerHTML = '<div class="col-span-2 text-center text-slate-500 py-12">Belum ada pesan WA yang diolah. Kirim pesan ke WhatsApp sekarang!</div>';
                return;
            }

            container.innerHTML = data.map(item => \`
                <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
                    <div class="flex justify-between items-start">
                        <span class="text-xs font-semibold px-2.5 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                            \${item.kategori}
                        </span>
                        <span class="text-xs text-slate-500">\${item.createdAt}</span>
                    </div>
                    <h3 class="text-lg font-semibold text-slate-100">\${item.judul}</h3>
                    <p class="text-sm text-slate-300 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">\${item.ringkasan}</p>
                    
                    \${item.action_item && item.action_item.length > 0 ? \`
                        <div class="space-y-1">
                            <span class="text-xs font-medium text-slate-400">Action Items:</span>
                            <ul class="list-disc list-inside text-xs text-indigo-300 space-y-0.5">
                                \${item.action_item.map(act => \`<li>\${act}</li>\`).join('')}
                            </ul>
                        </div>
                    \` : ''}
                    
                    <div class="text-[10px] text-slate-600 truncate">Pesan Asli: "\${item.raw}"</div>
                </div>
            \`).join('');
        }

        fetchNotes();
        setInterval(fetchNotes, 5000); // Auto-refresh tiap 5 detik
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server aktif di port ${PORT}`);
});