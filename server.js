// server.js
const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

// Cargar variables de entorno (solo para desarrollo local)
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
let examCollection; // Colección de CLASIFICACIONES (exam_classification)
let uniqueExamsCollection; // Colección de EXÁMENES ÚNICOS/MAESTRA (unique_exams) 

// Conexión a MongoDB
async function connectToMongo() {
    if (!uri) {
        console.error("FALTA MONGODB_URI. Asegúrate de configurarla en .env o en Render.");
        return;
    }
    try {
        await client.connect();
        console.log("Conectado exitosamente a MongoDB Atlas");
        db = client.db('motorizadoDB'); 
        // 1. Colección de Clasificaciones
        examCollection = db.collection('exam_classification'); 
        // 2. Colección de Lista Maestra
        uniqueExamsCollection = db.collection('unique_exams'); 
    } catch (e) {
        console.error("Error al conectar a MongoDB:", e);
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

// 1.5 ENDPOINT: Obtener TODAS las clasificaciones (para el caché del frontend)
app.get('/api/exams/classification/all', async (req, res) => {
    try {
        if (!examCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
        const classifications = await examCollection.find({})
                                                    .project({ _id: 0, exam_name: 1, tube: 1, instructions: 1 }) 
                                                    .toArray();
        res.json(classifications);
    } catch (e) {
        console.error("Error al obtener todas las clasificaciones:", e);
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

// 2.5 ENDPOINT: Obtener la lista maestra de exámenes (incluye metadata y CÓDIGO)
app.get('/api/exams/all-unique', async (req, res) => {
    try {
        if (!uniqueExamsCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
        // 🆕 Proyectamos el código, nombre y la metadata de auditoría
        const uniqueExams = await uniqueExamsCollection.find({})
                                                    .project({ _id: 0, exam_name: 1, exam_code: 1, added_by: 1, added_at: 1 }) 
                                                    .toArray();

        res.json(uniqueExams);
    } catch (e) {
        console.error("Error al obtener lista maestra de exámenes:", e);
        res.status(500).json({ message: "Error interno del servidor." });
    }
});


// 3. ⭐️ NUEVO ENDPOINT: Guardar Exámenes Únicos desde Frontend (Fix para 404)
// Esta ruta coincide con la llamada de fetch en index.html
app.post('/api/exams/save-unique', async (req, res) => {
    try {
        if (!uniqueExamsCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
        const { exams, added_by } = req.body; 

        if (!Array.isArray(exams) || exams.length === 0) {
            return res.status(400).json({ message: "Se espera un array de nombres de exámenes." });
        }

        // Crear las operaciones bulk para insertar/actualizar
        const bulkOps = exams.map(examName => ({
            updateOne: {
                filter: { 
                    exam_name: examName 
                }, 
                update: {
                    $setOnInsert: {
                        exam_name: examName,
                        exam_code: 'N/A', // El frontend no proporciona el código, se marca como 'N/A'
                        added_by: added_by || 'Sistema',
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


// 3.5. ENDPOINT ORIGINAL (Mantengo la numeración original para no desorganizar el archivo)
app.post('/api/exams/unique', async (req, res) => {
    try {
        if (!uniqueExamsCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }
        
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
                        exam_code: exam.exam_code || 'N/A', // 👈 Se guarda el código
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

// 4. ENDPOINT: OBTENER TODOS LOS EXÁMENES CON SU CLASIFICACIÓN (No es usado por el nuevo frontend)
app.get('/api/exams/guide', async (req, res) => {
    try {
        if (!uniqueExamsCollection || !examCollection) {
            return res.status(503).json({ message: "Servicio no disponible: Base de datos no conectada." });
        }

        // 1. Obtener la lista maestra (nombre y código)
        const uniqueExams = await uniqueExamsCollection.find({})
                                                    .project({ _id: 0, exam_name: 1, exam_code: 1 }) 
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
