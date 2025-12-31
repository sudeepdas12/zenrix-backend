const express = require('express');
const Product = require('../models/Product');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.png';
        cb(null, `${unique}${ext}`);
    }
});

const fileFilter = (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (jpeg, png, webp, gif)'));
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Small coercion helpers to keep parsing consistent and readable
function coerceNumber(value, fallback) {
    if (typeof value === 'undefined' || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function coerceBoolean(value) {
    return value === 'on' || value === 'true' || value === true;
}

function coerceDate(value) {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d) ? undefined : d;
}

// GET all products
router.get('/', async (req, res) => {
    try {
        const products = await Product.find();
        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET single product
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Conditional upload middleware: only run multer if request is multipart/form-data
function conditionalUpload(fieldsArray) {
    return (req, res, next) => {
        const ct = (req.headers['content-type'] || '').toLowerCase();
        if (ct.indexOf('multipart/form-data') !== -1) {
            const handler = upload.fields(fieldsArray);
            return handler(req, res, next);
        }
        return next();
    };
}

// POST create product (protected)
router.post('/', requireAdmin,
    conditionalUpload([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 4 }
    ]),
    body('name').isString().notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('category').isString().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        try {
            const mainImage = req.files?.image?.[0];
            const extraImages = req.files?.images || [];

            const imagePath = mainImage ? `/uploads/products/${mainImage.filename}` : (req.body.image || '');
            const imagesPaths = extraImages.map(f => `/uploads/products/${f.filename}`);

            const parsedSaleEnd = coerceDate(req.body.saleEnd);

            const product = new Product({
                name: req.body.name,
                price: coerceNumber(req.body.price, 0),
                salePrice: coerceNumber(req.body.salePrice, undefined),
                onSale: coerceBoolean(req.body.onSale),
                saleLabel: req.body.saleLabel,
                saleEnd: parsedSaleEnd,
                description: req.body.description,
                category: req.body.category,
                stock: parseInt(req.body.stock, 10) || 0,
                featured: coerceBoolean(req.body.featured),
                image: imagePath || undefined,
                images: imagesPaths.length ? imagesPaths : []
            });

            await product.save();
            res.status(201).json({ success: true, data: product });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    }
);

// UPDATE product (protected)
router.put('/:id', requireAdmin,
    conditionalUpload([
        { name: 'image', maxCount: 1 },
        { name: 'images', maxCount: 4 }
    ]),
    body('name').optional().isString().notEmpty(),
    body('price').optional().isFloat({ min: 0 }),
    body('category').optional().isString().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        try {
            const updates = { ...req.body };

            const mainImage = req.files?.image?.[0];
            const extraImages = req.files?.images || [];

            if (mainImage) {
                updates.image = `/uploads/products/${mainImage.filename}`;
            }

            if (extraImages.length) {
                updates.images = extraImages.map(f => `/uploads/products/${f.filename}`);
            }

            // Coerce boolean/number/date fields for updates
            if (typeof updates.price !== 'undefined') updates.price = coerceNumber(updates.price, updates.price);
            if (typeof updates.salePrice !== 'undefined') updates.salePrice = coerceNumber(updates.salePrice, undefined);
            if (typeof updates.stock !== 'undefined') updates.stock = parseInt(updates.stock, 10) || updates.stock;
            if (typeof updates.featured !== 'undefined') updates.featured = coerceBoolean(updates.featured);
            if (typeof updates.onSale !== 'undefined') updates.onSale = coerceBoolean(updates.onSale);
            if (typeof updates.saleEnd !== 'undefined') updates.saleEnd = coerceDate(updates.saleEnd);

            const product = await Product.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
            if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
            res.json({ success: true, data: product });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    }
);

// DELETE product (protected)
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Product deleted successfully',
            deletedId: product._id
        });
        
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error: ' + error.message
        });
    }
});

module.exports = router;