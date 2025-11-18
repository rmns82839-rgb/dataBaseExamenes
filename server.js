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
const port = process.env.PORT || 3000; 

// ⚠️ Leer la URI de la variable de entorno MONGODB_URI
const uri = process.env.MONGODB_URI; 
const client = new MongoClient(uri);

// Middleware
app.use(cors()); 
app.use(express.json()); 

let db;
let examCollection;
let uniqueExamsCollection; 

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
        // 'exam_classification' será tu colección existente
        examCollection = db.collection('exam_classification'); 
        // 'unique_exams' es la colección para la lista maestra de exámenes
        uniqueExamsCollection = db.collection('unique_exams'); 
    } catch (e) {
        console.error("Error al conectar a MongoDB:", e);
        // Aquí podrías cerrar el proceso si la conexión a BD es crítica
    }
}

connectToMongo();

// 1. ENDPOINT: Guardar o actualizar la clasificación de un examen
app.post('/api/exams/classify', async (req, res) => {
    try {
        if (!examCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
        const { exam_name, tube, instructions } = req.body;
        
        if (!exam_name || !tube) {
            return res.status(400).json({ message: "Nombre del examen y tubo son requeridos." });
        }

        const result = await examCollection.updateOne(
            { exam_name: exam_name },
            { 
                $set: { 
                    tube: tube,
                    instructions: instructions || ""
                }
            },
            { upsert: true } // Insertar si no existe
        );

        res.status(200).json({ message: "Clasificación guardada/actualizada con éxito.", result });

    } catch (e) {
        console.error("Error al guardar clasificación:", e);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// 2. ENDPOINT: Obtener la clasificación de un examen (no modificado)
app.get('/api/exams/classify/:exam_name', async (req, res) => {
    try {
        if (!examCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
        const examName = req.params.exam_name;
        const exam = await examCollection.findOne({ exam_name: examName });

        if (exam) {
            res.json(exam);
        } else {
            res.status(404).json({ message: "Clasificación no encontrada." });
        }
    } catch (e) {
        console.error("Error al obtener clasificación:", e);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// 3. ENDPOINT: Guardar lista de exámenes únicos (AHORA INCLUYE EL CÓDIGO)
app.post('/api/exams/unique', async (req, res) => {
    try {
        if (!uniqueExamsCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
        // El body ahora es un array de objetos { exam_code, exam_name }
        const exams = req.body; 

        if (!Array.isArray(exams) || exams.length === 0) {
            return res.status(400).json({ message: "Se espera un array de exámenes." });
        }

        const bulkOps = exams.map(exam => ({
            updateOne: {
                filter: { 
                    exam_name: exam.exam_name 
                }, 
                update: {
                    $setOnInsert: {
                        exam_name: exam.exam_name,
                        exam_code: exam.exam_code || 'N/A', // 👈 AGREGAMOS EL CÓDIGO
                        added_at: new Date()
                    }
                },
                upsert: true
            }
        }));
        
        const result = await uniqueExamsCollection.bulkWrite(bulkOps);

        res.status(200).json({ 
            message: `Procesados ${exams.length} exámenes. ${result.upsertedCount} nuevos insertados.`, 
            result
        });
    } catch (e) {
        console.error("Error al guardar lista de exámenes únicos:", e);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});

// 4. ENDPOINT: OBTENER TODOS LOS EXÁMENES CON SU CLASIFICACIÓN (Para la Guía)
app.get('/api/exams/guide', async (req, res) => {
    try {
        if (!uniqueExamsCollection || !examCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }

        // 1. Obtener la lista maestra (nombre y código)
        const uniqueExams = await uniqueExamsCollection.find({})
                                                    .project({ _id: 0, exam_name: 1, exam_code: 1 }) // 👈 Proyectamos el código
                                                    .toArray();
        
        // 2. Obtener todas las clasificaciones 
        const classifications = await examCollection.find({})
                                                    .project({ _id: 0, exam_name: 1, tube: 1, instructions: 1 }) 
                                                    .toArray();

        // 3. Crear un mapa para buscar rápidamente la clasificación
        const classificationMap = classifications.reduce((map, item) => {
            map[item.exam_name] = { tube: item.tube, instructions: item.instructions };
            return map;
        }, {});
        
        // 4. Combinar los datos
        const guideData = uniqueExams.map(exam => ({
            exam_name: exam.exam_name,
            exam_code: exam.exam_code, // Incluimos el código
            tube: classificationMap[exam.exam_name] ? classificationMap[exam.exam_name].tube : 'Pendiente', 
            instructions: classificationMap[exam.exam_name] ? classificationMap[exam.exam_name].instructions : ''
        }));

        res.json(guideData);

    } catch (e) {
        console.error("Error al obtener la guía de exámenes:", e);
        res.status(500).json({ message: "Error interno del servidor al obtener la guía." });
    }
});


app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
