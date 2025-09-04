const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

dotenv.config();

// ==== Configs básicas ====
const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

// ==== MongoDB ====
mongoose.set('strictQuery', true);
mongoose
  .connect(process.env.MONGO_URI, { dbName: 'igorvalen_catalog' })
  .then(() => console.log('[mongo] connected'))
  .catch((err) => {
    console.error('[mongo] error', err);
    process.exit(1);
  });

// ==== Cloudinary ====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ==== Models ====
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    codes: String,
    flavors: String,
    priceUV: Number, // Unidade à vista
    priceFV: Number, // Pacote à vista
    priceUP: Number, // Unidade a prazo
    priceFP: Number, // Pacote a prazo
    imageUrl: String,
    active: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: true }
);
const Product = mongoose.model('Product', productSchema);

const settingsSchema = new mongoose.Schema(
  {
    categoriesOrder: { type: [String], default: [] },
  },
  { timestamps: true }
);
const Settings = mongoose.model('Settings', settingsSchema);

async function ensureDefaultSettings() {
  const count = await Settings.countDocuments();
  if (count === 0) {
    await Settings.create({
      categoriesOrder: [
        'Bebidas não alcoólicas',
        'Bebidas alcoólicas',
        'Bomboneire',
        'Salgadinhos',
        'Utilidades',
      ],
    });
    console.log('[settings] default created');
  }
}
ensureDefaultSettings().catch(console.error);

// ==== Auth middleware ====
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, JWT_SECRET, (err, data) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = data;
    next();
  });
}

// ==== Multer (upload memória) ====
const upload = multer({ storage: multer.memoryStorage() });

// ==== Rotas ====
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false, error: 'missing password' });
  if (password !== ADMIN_PASSWORD) return res.json({ ok: false });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ ok: true, token });
});

app.get('/api/settings', async (req, res) => {
  const s = await Settings.findOne();
  res.json(s || { categoriesOrder: [] });
});

// Catálogo público (lista produtos ativos com filtros)
app.get('/api/catalog', async (req, res) => {
  const { q = '', category = '' } = req.query;
  const query = { active: true };
  if (category) query.category = category;
  if (q) {
    const rx = new RegExp(q, 'i');
    query.$or = [{ name: rx }, { category: rx }, { codes: rx }, { flavors: rx }];
  }
  const [settings, products] = await Promise.all([
    Settings.findOne(),
    Product.find(query).sort({ position: 1, name: 1 }).lean(),
  ]);
  res.json({ products, settings: settings || { categoriesOrder: [] } });
});

// ===== Rotas ADMIN =====
app.get('/api/admin/products', requireAuth, async (req, res) => {
  const prods = await Product.find().sort({ position: 1, name: 1 }).lean();
  res.json(prods);
});

app.get('/api/products/:id', requireAuth, async (req, res) => {
  const p = await Product.findById(req.params.id).lean();
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

app.post('/api/products', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const body = req.body || {};
    const data = {
      name: body.name,
      category: body.category,
      codes: body.codes || '',
      flavors: body.flavors || '',
      priceUV: body.priceUV ? Number(body.priceUV) : undefined,
      priceFV: body.priceFV ? Number(body.priceFV) : undefined,
      priceUP: body.priceUP ? Number(body.priceUP) : undefined,
      priceFP: body.priceFP ? Number(body.priceFP) : undefined,
      active: body.active !== 'false',
    };
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'igorvalen/catalog' },
          (err, r) => (err ? reject(err) : resolve(r))
        );
        stream.end(req.file.buffer);
      });
      data.imageUrl = uploadResult.secure_url;
    }
    // posição = último
    const last = await Product.findOne().sort({ position: -1 });
    data.position = last ? (last.position || 0) + 1 : 0;
    const created = await Product.create(data);
    res.json(created);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'create_failed' });
  }
});

app.put('/api/products/:id', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const body = req.body || {};
    const data = {
      name: body.name,
      category: body.category,
      codes: body.codes || '',
      flavors: body.flavors || '',
      priceUV: body.priceUV === undefined || body.priceUV === '' ? undefined : Number(body.priceUV),
      priceFV: body.priceFV === undefined || body.priceFV === '' ? undefined : Number(body.priceFV),
      priceUP: body.priceUP === undefined || body.priceUP === '' ? undefined : Number(body.priceUP),
      priceFP: body.priceFP === undefined || body.priceFP === '' ? undefined : Number(body.priceFP),
      active: body.active !== 'false',
    };
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'igorvalen/catalog' },
          (err, r) => (err ? reject(err) : resolve(r))
        );
        stream.end(req.file.buffer);
      });
      data.imageUrl = uploadResult.secure_url;
    }
    const updated = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'update_failed' });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

app.post('/api/products/reorder', requireAuth, async (req, res) => {
  const ids = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'invalid body' });
  await Promise.all(
    ids.map((id, i) => Product.findByIdAndUpdate(id, { position: i }))
  );
  res.json({ ok: true });
});

// Servir estáticos (front-end)
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { maxAge: '1h' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => console.log(`> http://localhost:${PORT}`));
