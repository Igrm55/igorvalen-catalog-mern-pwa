const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

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
const CLOUDINARY_ENABLED =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

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

// ==== Helpers ====
function parseOptionalNumber(value) {
 codex/fix-product-addition-issue-in-catalog-ptvj1u
  if (value === undefined || value === '') return undefined;
  const n = Number(String(value).replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true' || value === 1 || value === '1';
}


 codex/fix-product-addition-issue-in-catalog-ox22hi
  if (value === undefined || value === '') return undefined;
  const n = Number(String(value).replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;

 codex/fix-product-addition-issue-in-catalog-zshptb
  if (value === undefined || value === '') return undefined;
  const n = Number(String(value).replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;

  return value === undefined || value === '' ? undefined : Number(value);
 main
 main
}

function parseBoolean(value) {
  return !(value === 'false' || value === false);
}

 codex/fix-product-addition-issue-in-catalog-ox22hi
 main
async function saveImage(file) {
  if (!file) return undefined;
  if (CLOUDINARY_ENABLED) {
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'igorvalen/catalog' },
          (err, r) => (err ? reject(err) : resolve(r))
        );
        stream.end(file.buffer);
      });
      return uploadResult.secure_url;
    } catch (err) {
      console.error('[cloudinary] upload failed', err.message);
 codex/fix-product-addition-issue-in-catalog-ptvj1u

      return undefined;
 main
    }
  }
  const filename = `${Date.now()}-${file.originalname}`.replace(/\s+/g, '_');
  const uploadPath = path.join(__dirname, 'public', 'uploads', filename);
  await fs.promises.mkdir(path.dirname(uploadPath), { recursive: true });
  await fs.promises.writeFile(uploadPath, file.buffer);
  return '/uploads/' + filename;
}

 codex/fix-product-addition-issue-in-catalog-ptvj1u


 main
 main
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
    if (!body.name || !body.category)
      return res.status(400).json({ error: 'missing fields' });

    const data = {
      name: body.name,
      category: body.category,
      codes: body.codes || '',
      flavors: body.flavors || '',
 codex/fix-product-addition-issue-in-catalog-ptvj1u
    };

    const priceFields = ['priceUV', 'priceFV', 'priceUP', 'priceFP'];
    for (const f of priceFields) {
      const raw = body[f];
      const parsed = parseOptionalNumber(raw);
      if (raw !== undefined && raw !== '' && parsed === undefined)
        return res.status(400).json({ error: 'invalid number', field: f });
      if (parsed !== undefined) data[f] = parsed;
    }

    const activeParsed = parseBoolean(body.active);
    data.active = activeParsed !== undefined ? activeParsed : true;

    const img = await saveImage(req.file);
    if (img) data.imageUrl = img;


      priceUV: parseOptionalNumber(body.priceUV),
      priceFV: parseOptionalNumber(body.priceFV),
      priceUP: parseOptionalNumber(body.priceUP),
      priceFP: parseOptionalNumber(body.priceFP),
      active: parseBoolean(body.active),
    };
      const img = await saveImage(req.file);
      if (img) data.imageUrl = img;
    // posição = último
 main
    const last = await Product.findOne().sort({ position: -1 });
    data.position = last ? (last.position || 0) + 1 : 0;
    const created = await Product.create(data);
    res.status(201).json(created);
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
 codex/fix-product-addition-issue-in-catalog-ptvj1u
    };

    const priceFields = ['priceUV', 'priceFV', 'priceUP', 'priceFP'];
    for (const f of priceFields) {
      const raw = body[f];
      const parsed = parseOptionalNumber(raw);
      if (raw !== undefined && raw !== '' && parsed === undefined)
        return res.status(400).json({ error: 'invalid number', field: f });
      if (parsed !== undefined) data[f] = parsed;
    }

    const activeParsed = parseBoolean(body.active);
    if (activeParsed !== undefined) data.active = activeParsed;

    const img = await saveImage(req.file);
    if (img) data.imageUrl = img;

    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
    const updated = await Product.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });

      priceUV: parseOptionalNumber(body.priceUV),
      priceFV: parseOptionalNumber(body.priceFV),
      priceUP: parseOptionalNumber(body.priceUP),
      priceFP: parseOptionalNumber(body.priceFP),
      active: parseBoolean(body.active),
    };
      const img = await saveImage(req.file);
      if (img) data.imageUrl = img;
    const updated = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
 main
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
