// Dépendances et initialisation
const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration de la connexion à la base de données PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// --- Données statiques des transporteurs et des prix ---
const WORKERS = [
  { id: 1, name: "Bill" },
  { id: 2, name: "Petit" },
  { id: 3, name: "Charles" },
  { id: 4, name: "PetFre" },
  { id: 5, name: "GoodMan" },
  { id: 6, name: "Nani" },
];

const PRICES = {
  sac: 500, // 500 FCFA par sac
  bal: 2500, // 2500 FCFA par bal
};

// Fonction de création de la table (version simplifiée)
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transports (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        amount INTEGER NOT NULL CHECK (amount > 0),
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "transports" prête ou déjà existante.');
  } catch (err) {
    console.error("Erreur lors de la création de la table:", err);
  }
}

// Appelle la fonction de création des tables au démarrage du serveur
createTables();

// --- Routes API ---

// Route pour obtenir les transporteurs (maintenant statique)
app.get("/api/workers", async (req, res) => {
  res.json(WORKERS);
});

// Route pour ajouter un transport
app.post("/api/transports", async (req, res) => {
  const { type, quantity, worker_id } = req.body;

  if (!type || !quantity || !worker_id) {
    return res
      .status(400)
      .json({
        message: "Le type, la quantité et l'ID du transporteur sont requis.",
      });
  }
  const pricePerUnit = PRICES[type];
  const amount = quantity * pricePerUnit;

  try {
    await pool.query(
      "INSERT INTO transports (type, quantity, amount, worker_id) VALUES ($1, $2, $3, $4);",
      [type, quantity, amount, worker_id]
    );
    res.status(201).json({ message: "Transport enregistré avec succès" });
  } catch (err) {
    console.error("Erreur lors de l'ajout du transport:", err);
    res.status(500).json({ error: err.message });
  }
});

// Route pour obtenir tous les transports (avec le nom du transporteur)
app.get("/api/transports", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, worker_id, type, quantity, amount, timestamp
      FROM transports
      ORDER BY timestamp DESC;
    `);

    // Ajout du nom du transporteur à partir du tableau statique
    const transportsWithWorkerName = result.rows.map((t) => {
      const worker = WORKERS.find((w) => w.id === t.worker_id);
      return {
        ...t,
        worker_name: worker ? worker.name : "Inconnu",
      };
    });

    res.json(transportsWithWorkerName);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Route pour supprimer un transport
app.delete("/api/transports/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "DELETE FROM transports WHERE id = $1 RETURNING *;",
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Transport non trouvé." });
    }
    res.json({ message: "Transport supprimé avec succès." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// NOUVELLE ROUTE : Supprime tout l'historique des transports
app.delete("/api/transports/all", async (req, res) => {
  try {
    await pool.query("DELETE FROM transports;");
    res.json({ message: "Historique complet supprimé avec succès." });
  } catch (err) {
    console.error("Erreur lors de la suppression de tout l'historique:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Routes API pour les résumés ---

// Route pour obtenir le résumé global du montant total et des quantités
app.get("/api/summary", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
          COALESCE(SUM(amount), 0)::numeric AS total_amount,
          COALESCE(SUM(CASE WHEN type = 'sac' THEN quantity ELSE 0 END), 0)::int AS total_sacs,
          COALESCE(SUM(CASE WHEN type = 'bal' THEN quantity ELSE 0 END), 0)::int AS total_bals
      FROM transports;
    `);
    const summaryData = result.rows[0];
    res.json({
      total_amount: parseFloat(summaryData.total_amount),
      counts: {
        sac: summaryData.total_sacs,
        bal: summaryData.total_bals,
      },
    });
  } catch (err) {
    console.error("Erreur lors du chargement du résumé optimisé:", err);
    res.status(500).json({ error: err.message });
  }
});

// Nouvelle route pour le résumé par transporteur
app.get("/api/summary/by-worker", async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT
                worker_id,
                COALESCE(SUM(amount), 0)::numeric AS total_amount,
                COALESCE(SUM(CASE WHEN type = 'sac' THEN quantity ELSE 0 END), 0)::int AS total_sacs,
                COALESCE(SUM(CASE WHEN type = 'bal' THEN quantity ELSE 0 END), 0)::int AS total_bals
            FROM transports
            GROUP BY worker_id
            ORDER BY worker_id;
        `);

    // Ajout du nom du transporteur à partir du tableau statique
    const summariesWithWorkerName = result.rows.map((s) => {
      const worker = WORKERS.find((w) => w.id === s.worker_id);
      return {
        ...s,
        worker_name: worker ? worker.name : "Inconnu",
      };
    });

    res.json(summariesWithWorkerName);
  } catch (err) {
    console.error("Erreur lors du chargement du résumé par transporteur:", err);
    res.status(500).json({ error: err.message });
  }
});

// Servir les fichiers statiques (Frontend)
app.use(express.static(path.join(__dirname, "public")));
app.get("/service-worker.js", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "service-worker.js"), {
    headers: {
      "Content-Type": "application/javascript",
    },
  });
});
app.get("/manifest.json", (req, res) => {
  res.sendFile(path.resolve(__dirname, "public", "manifest.json"));
});
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
