// server.js
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

// Cargar variables de entorno (solo para desarrollo local)
// Render ya las provee en producción.
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const app = express();
// ⚠️ CAMBIO CRÍTICO: Definimos el puerto usando SOLO la variable de entorno de Render
const port = process.env.PORT; 

// ⚠️ Leer la URI de la variable de entorno MONGODB_URI
const uri = process.env.MONGODB_URI; 
const client = new MongoClient(uri);

// Middleware
app.use(cors()); 
app.use(express.json()); 

let db;
let examCollection;

// Conexión a MongoDB
async function connectToMongo() {
    if (!uri) {
        console.error("FALTA MONGODB_URI. Asegúrate de configurarla en .env o en Render.");
        return;
    }
    try {
        await client.connect();
        console.log("Conectado exitosamente a MongoDB Atlas");
        // 'motorizadoDB' será el nombre de tu base de datos
        db = client.db('motorizadoDB'); 
        // 'exam_classification' será tu colección
        examCollection = db.collection('exam_classification'); 
    } catch (e) {
        console.error("Error de conexión a MongoDB:", e);
    }
}
connectToMongo();

// ----------------------------------------------------------------------
// 1. ENDPOINT PARA LEER TODAS LAS CLASIFICACIONES (GET)
// ----------------------------------------------------------------------
app.get('/api/classification', async (req, res) => {
    try {
        if (!examCollection) {
             return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        // Obtener todos los documentos y transformarlos en un mapa clave-valor
        const data = await examCollection.find({}).toArray();
        const dataMap = data.reduce((acc, item) => {
            acc[item.exam_name] = {
                tube: item.tube,
                instructions: item.instructions
            };
            return acc;
        }, {});
        res.json(dataMap);
    } catch (e) {
        console.error("Error al obtener clasificaciones:", e);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// ----------------------------------------------------------------------
// 2. ENDPOINT PARA GUARDAR/ACTUALIZAR UNA CLASIFICACIÓN (POST)
// ----------------------------------------------------------------------
app.post('/api/classification', async (req, res) => {
    try {
        if (!examCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        const { exam_name, tube, instructions } = req.body;

        if (!exam_name) {
            return res.status(400).json({ message: "Falta el campo 'exam_name'." });
        }
        
        // Upsert: busca por exam_name, actualiza los campos, si no existe, lo crea.
        const result = await examCollection.updateOne(
            { exam_name: exam_name }, 
            { $set: { tube: tube, instructions: instructions } }, 
            { upsert: true }
        );

        res.status(200).json({ 
            message: "Clasificación guardada/actualizada.", 
            result
        });
    } catch (e) {
        console.error("Error al guardar clasificación:", e);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// ----------------------------------------------------------------------
// 3. INICIO DEL SERVIDOR
// ----------------------------------------------------------------------

// Verificamos que el puerto exista (Render lo provee) antes de iniciar el listener
if (!port) {
    console.error("FALTA LA VARIABLE DE ENTORNO PORT. El servidor no puede iniciar sin ella.");
} else {
    app.listen(port, () => {
        console.log(`Servidor Express corriendo en el puerto ${port}`);
    });
}
